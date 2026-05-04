# src/ingest.py
import os
import sys
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from langchain_cohere import CohereEmbeddings
from langchain_community.document_loaders import PyPDFLoader, Docx2txtLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from pinecone import Pinecone
from pinecone_text.sparse import BM25Encoder
from config import (
    COHERE_API_KEY, PINECONE_API_KEY, PINECONE_INDEX_NAME,
    EMBEDDING_MODEL, CHUNK_SIZE, CHUNK_OVERLAP, BM25_PATH
)

# --- Clients ---
embedder = CohereEmbeddings(
    cohere_api_key=COHERE_API_KEY,
    model=EMBEDDING_MODEL
)

pc = Pinecone(api_key=PINECONE_API_KEY)
index = pc.Index(PINECONE_INDEX_NAME)
bm25 = BM25Encoder()

# --- Splitter ---
splitter = RecursiveCharacterTextSplitter(
    chunk_size=CHUNK_SIZE,
    chunk_overlap=CHUNK_OVERLAP
)

# --- Load file ---
def load_file(path: str):
    if path.endswith(".pdf"):
        return PyPDFLoader(path).load()
    elif path.endswith(".docx"):
        return Docx2txtLoader(path).load()
    else:
        raise ValueError(f"Unsupported file type: {path}")

# --- Detect namespace from filename ---
def get_namespace(filename: str) -> str:
    name = filename.lower()
    if any(k in name for k in ["finance", "expense", "budget", "capex", "procurement", "accounting"]):
        return "finance-policies"
    elif any(k in name for k in ["hr", "leave", "conduct", "performance", "remote", "disciplin", "policies"]):
        return "hr-policies"
    return "hr-policies"

# --- Check already ingested ---
def is_already_ingested() -> bool:
    stats = index.describe_index_stats()
    total = stats.get("total_vector_count", 0)
    if total > 0:
        print(f"Index already has {total} vectors. Skipping ingestion.")
        return True
    return False

# --- Ingest one file ---
def ingest_file(path: str):
    filename = os.path.basename(path)
    namespace = get_namespace(filename)

    print(f"\nLoading: {filename} → namespace: {namespace}")

    docs = load_file(path)
    chunks = splitter.split_documents(docs)

    print(f"  Chunks created: {len(chunks)}")

    texts = [c.page_content for c in chunks]

    # Dense vectors
    print("  Generating dense vectors...")
    dense_vectors = embedder.embed_documents(texts)

    # Sparse vectors — fit and save BM25
    print("  Generating sparse vectors...")
    bm25.fit(texts)
    sparse_vectors = bm25.encode_documents(texts)

    # Build Pinecone records
    vectors = []
    for i, (text, dense, sparse) in enumerate(zip(texts, dense_vectors, sparse_vectors)):
        vectors.append({
            "id": f"{filename}-chunk-{i}",
            "values": dense,
            "sparse_values": sparse,
            "metadata": {
                "text": text,
                "source": filename,
                "namespace": namespace,
                "chunk_index": i
            }
        })

    # Upsert in batches of 50
    batch_size = 50
    for i in range(0, len(vectors), batch_size):
        batch = vectors[i:i + batch_size]
        index.upsert(vectors=batch, namespace=namespace)
        print(f"  Upserted batch {i // batch_size + 1}/{-(-len(vectors) // batch_size)}")

    print(f"  ✓ Done: {filename}")

# --- Ingest all files in data/raw ---
def ingest_all(folder: str = "data/raw"):
    if is_already_ingested():
        return

    files = [
        os.path.join(folder, f)
        for f in os.listdir(folder)
        if f.endswith(".pdf") or f.endswith(".docx")
    ]

    if not files:
        print("No PDF or DOCX files found in data/raw")
        return

    print(f"Found {len(files)} file(s) to ingest...")

    for path in files:
        ingest_file(path)

    # Save BM25 params after all files ingested
    bm25.dump(BM25_PATH)
    print(f"\nBM25 params saved to {BM25_PATH}")
    print("\nAll files ingested successfully.")

if __name__ == "__main__":
    ingest_all()