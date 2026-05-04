# src/config.py
from dotenv import load_dotenv
import os

load_dotenv()

# --- API Keys ---
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
COHERE_API_KEY = os.getenv("COHERE_API_KEY")
PINECONE_API_KEY = os.getenv("PINECONE_API_KEY")

# --- Models ---
LLM_MODEL = "llama-3.1-8b-instant"
EMBEDDING_MODEL = "embed-english-v3.0"
EMBEDDING_DIMS = 1024

# --- Pinecone ---
PINECONE_INDEX_NAME = "policy-rag"
PINECONE_NAMESPACE_HR = "hr-policies"
PINECONE_NAMESPACE_FINANCE = "finance-policies"

# --- Chunking ---
CHUNK_SIZE = 400
CHUNK_OVERLAP = 50

# --- Retrieval ---
TOP_K = 7                  # ← changed from 5 to 7

# --- Hybrid Search ---
HYBRID_ALPHA = 0.75

# --- CRAG ---
MAX_RETRIES = 1

# --- BM25 ---
BM25_PATH = "data/bm25_params.json"