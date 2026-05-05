# src/api.py
import os
import sys
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from graph import rag_graph
import traceback

app = FastAPI()

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    print("CRASH TRACEBACK:")
    traceback.print_exc()
    return JSONResponse(
        status_code=500,
        content={"error": str(exc), "traceback": traceback.format_exc()}
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"status": "Policy Assistant API is running! Go to /docs to test it."}

class ChatRequest(BaseModel):
    question: str

@app.post("/chat")
def chat(req: ChatRequest):
    state = {
        "question": req.question,
        "namespace": "",
        "chunks": [],
        "grade": "",
        "answer": "",
        "retries": 0
    }
    result = rag_graph.invoke(state)
    return {
        "answer": result["answer"],
        "namespace": result["namespace"],
        "sources": list(set([
            c.split("\n")[0][:60]
            for c in result["chunks"]
            if c
        ]))
    }