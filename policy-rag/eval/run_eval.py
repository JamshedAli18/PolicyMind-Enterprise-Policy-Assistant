# eval/run_eval.py
import os
import sys
import json
sys.path.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), "../src"))

from graph import rag_graph

def run_eval():
    dataset_path = os.path.join(os.path.dirname(__file__), "golden_dataset.json")
    with open(dataset_path, "r") as f:
        dataset = json.load(f)

    results = []

    print(f"\nRunning eval on {len(dataset)} questions...\n")
    print("=" * 60)

    for i, item in enumerate(dataset):
        question = item["question"]
        ground_truth = item["ground_truth"]

        print(f"[{i+1}/{len(dataset)}] {question}")

        state = {
            "question": question,
            "namespace": "",
            "chunks": [],
            "grade": "",
            "answer": "",
            "retries": 0
        }

        result = rag_graph.invoke(state)

        results.append({
            "question": question,
            "answer": result["answer"],
            "contexts": result["chunks"],
            "ground_truth": ground_truth
        })

        print(f"  Answer: {result['answer'][:100]}...")
        print()

    # Save results
    output_path = os.path.join(os.path.dirname(__file__), "eval_results.json")
    with open(output_path, "w") as f:
        json.dump(results, f, indent=2)

    print("=" * 60)
    print(f"\nResults saved to eval/eval_results.json")
    print("Now run: uv run python eval/score.py")

if __name__ == "__main__":
    run_eval()