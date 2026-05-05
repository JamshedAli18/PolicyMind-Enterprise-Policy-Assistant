# src/graph.py
import os
import sys
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from typing import TypedDict, List
import nltk
try:
    nltk.data.find('tokenizers/punkt')
except LookupError:
    nltk.download('punkt', quiet=True)
try:
    nltk.data.find('tokenizers/punkt_tab')
except LookupError:
    nltk.download('punkt_tab', quiet=True)

from langchain_groq import ChatGroq
from langchain_cohere import CohereEmbeddings
from langchain_core.messages import HumanMessage, SystemMessage
from pinecone import Pinecone
from pinecone_text.sparse import BM25Encoder
from langgraph.graph import StateGraph, END
from config import (
    GROQ_API_KEY, COHERE_API_KEY, PINECONE_API_KEY,
    PINECONE_INDEX_NAME, LLM_MODEL, EMBEDDING_MODEL,
    TOP_K, HYBRID_ALPHA, MAX_RETRIES,
    PINECONE_NAMESPACE_HR, PINECONE_NAMESPACE_FINANCE,
    BM25_PATH
)

# --- Clients ---
llm = ChatGroq(api_key=GROQ_API_KEY, model=LLM_MODEL)

embedder = CohereEmbeddings(
    cohere_api_key=COHERE_API_KEY,
    model=EMBEDDING_MODEL
)

pc = Pinecone(api_key=PINECONE_API_KEY)
index = pc.Index(PINECONE_INDEX_NAME)

# --- Load BM25 from disk ---
bm25 = BM25Encoder()
if os.path.exists(BM25_PATH):
    bm25.load(BM25_PATH)
    print("BM25 loaded from disk.")
else:
    bm25 = BM25Encoder().default()
    print("BM25 using default (run ingest.py to generate saved params).")

# --- State ---
class RagState(TypedDict):
    question: str
    namespace: str
    chunks: List[str]
    grade: str
    answer: str
    retries: int

# --- LLM-based namespace classifier ---
def detect_namespace(question: str) -> str:
    messages = [
        SystemMessage(content="""You classify employee questions into one of two categories:
- hr: questions about leave, attendance, conduct, performance, remote work, discipline, parental leave, PIP, promotion
- finance: questions about expenses, budget, procurement, assets, payments, accounting, depreciation, capitalization, reimbursement, hotel, meals

Reply with only one word: 'hr' or 'finance'."""),
        HumanMessage(content=question)
    ]
    result = llm.invoke(messages)
    if "finance" in result.content.lower():
        return PINECONE_NAMESPACE_FINANCE
    return PINECONE_NAMESPACE_HR

# --- Node 1: Retrieve ---
def retrieve(state: RagState) -> RagState:
    question = state["question"]
    namespace = detect_namespace(question)

    print(f"\n[Retrieve] namespace: {namespace}")

    dense = embedder.embed_query(question)
    sparse = bm25.encode_queries(question)

    # Apply hybrid alpha scaling locally
    dense = [v * HYBRID_ALPHA for v in dense]
    if "values" in sparse:
        sparse["values"] = [v * (1.0 - HYBRID_ALPHA) for v in sparse["values"]]

    results = index.query(
        vector=dense,
        sparse_vector=sparse,
        top_k=TOP_K,
        namespace=namespace,
        include_metadata=True
    )

    chunks = [
        match["metadata"]["text"]
        for match in results["matches"]
        if "text" in match["metadata"]
    ]

    print(f"[Retrieve] Got {len(chunks)} chunks")
    return {**state, "chunks": chunks, "namespace": namespace}

# --- Node 2: Grade ---
def grade(state: RagState) -> RagState:
    question = state["question"]
    chunks = state["chunks"]

    if not chunks:
        print("[Grade] No chunks → irrelevant")
        return {**state, "grade": "irrelevant"}

    context = "\n\n".join(chunks)

    messages = [
        SystemMessage(content="""You are a grader checking if retrieved policy chunks are relevant to a question.
Reply with only one word: 'relevant' or 'irrelevant'."""),
        HumanMessage(content=f"Question: {question}\n\nChunks:\n{context}")
    ]

    result = llm.invoke(messages)
    grade = "relevant" if "relevant" in result.content.lower() else "irrelevant"

    print(f"[Grade] → {grade}")
    return {**state, "grade": grade}

# --- Node 3: Rewrite query ---
def rewrite(state: RagState) -> RagState:
    question = state["question"]
    retries = state["retries"]

    print(f"[Rewrite] Rewriting query (attempt {retries + 1})")

    messages = [
        SystemMessage(content="""You are rewriting an employee's question to improve
policy document retrieval. Make it more specific and use policy terminology.
Return only the rewritten question, nothing else."""),
        HumanMessage(content=f"Original question: {question}")
    ]

    result = llm.invoke(messages)
    new_question = result.content.strip()

    print(f"[Rewrite] New question: {new_question}")
    return {**state, "question": new_question, "retries": retries + 1}

# --- Node 4: Generate ---
def generate(state: RagState) -> RagState:
    question = state["question"]
    chunks = state["chunks"]

    if not chunks:
        return {**state, "answer": (
            "I don't have enough information in the policy documents to answer this. "
            "Please contact HR or Finance directly."
        )}

    context = "\n\n".join(chunks)

    messages = [
        SystemMessage(content="""You are an internal HR and Finance policy assistant.
Answer employee questions strictly based on the provided policy context.
Always cite the Policy ID (e.g., HR-004, FIN-003) when referencing a rule.
If the answer is not in the context, say: 'I don't have that information in the current policy documents. Please contact HR or Finance directly.'
Never speculate or answer from general knowledge.
Only use information explicitly stated in the context."""),
        HumanMessage(content=f"Context:\n{context}\n\nQuestion: {question}")
    ]

    result = llm.invoke(messages)
    print(f"[Generate] Answer generated")
    return {**state, "answer": result.content.strip()}

# --- Routing ---
def route_after_grade(state: RagState) -> str:
    if state["grade"] == "relevant":
        return "generate"
    if state["retries"] >= MAX_RETRIES:
        print("[Route] Max retries reached → generate with what we have")
        return "generate"
    return "rewrite"

# --- Build Graph ---
def build_graph():
    graph = StateGraph(RagState)

    graph.add_node("retrieve", retrieve)
    graph.add_node("grade", grade)
    graph.add_node("rewrite", rewrite)
    graph.add_node("generate", generate)

    graph.set_entry_point("retrieve")
    graph.add_edge("retrieve", "grade")
    graph.add_conditional_edges("grade", route_after_grade, {
        "generate": "generate",
        "rewrite": "rewrite"
    })
    graph.add_edge("rewrite", "retrieve")
    graph.add_edge("generate", END)

    return graph.compile()

rag_graph = build_graph()