# src/chatbot.py
import os
import sys
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from graph import rag_graph

def run_chatbot():
    print("\n" + "="*50)
    print("  Policy RAG Chatbot")
    print("  Type 'exit' to quit")
    print("="*50 + "\n")

    while True:
        question = input("You: ").strip()

        if not question:
            continue

        if question.lower() in ["exit", "quit", "q"]:
            print("Goodbye!")
            break

        state = {
            "question": question,
            "namespace": "",
            "chunks": [],
            "grade": "",
            "answer": "",
            "retries": 0
        }

        result = rag_graph.invoke(state)

        print(f"\nAssistant: {result['answer']}\n")
        print("-" * 50)

if __name__ == "__main__":
    run_chatbot()