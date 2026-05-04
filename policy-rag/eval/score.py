# eval/score.py
import os
import json
import pandas as pd

# --- Load results ---
results_path = os.path.join(os.path.dirname(__file__), "eval_results.json")
with open(results_path, "r") as f:
    results = json.load(f)

print(f"\nAnalyzing {len(results)} results...\n")

rows = []
for r in results:
    question    = r["question"]
    answer      = r["answer"].lower()
    ground_truth = r["ground_truth"].lower()
    contexts    = " ".join(r["contexts"]).lower()

    # Correctness — key ground truth terms in answer
    truth_words = [w.strip(".,()$%") for w in ground_truth.split() if len(w) > 3]
    correctness = round(sum(1 for w in truth_words if w in answer) / max(len(truth_words), 1), 2)

    # Context Recall — ground truth terms found in retrieved chunks
    context_recall = round(sum(1 for w in truth_words if w in contexts) / max(len(truth_words), 1), 2)

    # Faithfulness — answer terms found in retrieved chunks (not hallucinated)
    answer_words = [w.strip(".,()$%") for w in answer.split() if len(w) > 3]
    faithfulness = round(sum(1 for w in answer_words if w in contexts) / max(len(answer_words), 1), 2)

    # Hallucination flag
    hallucination = "⚠️ YES" if ("don't have" in answer or "contact hr" in answer and correctness > 0.3) else "✓ NO"

    # Wrong namespace flag
    wrong_ns = "⚠️ YES" if not r["contexts"] or context_recall < 0.2 else "✓ NO"

    rows.append({
        "question":       question[:55],
        "correctness":    correctness,
        "context_recall": context_recall,
        "faithfulness":   faithfulness,
        "hallucination":  hallucination,
        "wrong_namespace": wrong_ns
    })

df = pd.DataFrame(rows)

# --- Full table ---
print("=" * 110)
print("EVAL REPORT")
print("=" * 110)
print(df.to_string(index=False))

# --- Averages ---
print("\n" + "=" * 110)
print("AVERAGE SCORES")
print("=" * 110)
for col in ["correctness", "context_recall", "faithfulness"]:
    avg = df[col].mean()
    status = "✓ GOOD" if avg >= 0.6 else "✗ needs work"
    print(f"  {col:<20} {avg:.2f}  {status}")

# --- Issues ---
print("\n" + "=" * 110)
print("ISSUES DETECTED")
print("=" * 110)
hallucinations = df[df["hallucination"] == "⚠️ YES"]["question"].tolist()
wrong_ns       = df[df["wrong_namespace"] == "⚠️ YES"]["question"].tolist()

print(f"\n  Hallucinations ({len(hallucinations)}):")
for q in hallucinations:
    print(f"    - {q}")

print(f"\n  Wrong/missing namespace ({len(wrong_ns)}):")
for q in wrong_ns:
    print(f"    - {q}")

# --- Improvement suggestions ---
print("\n" + "=" * 110)
print("IMPROVEMENT SUGGESTIONS")
print("=" * 110)
avg_correctness    = df["correctness"].mean()
avg_recall         = df["context_recall"].mean()
avg_faithfulness   = df["faithfulness"].mean()

if avg_recall < 0.6:
    print("  ✗ Low context recall → increase TOP_K from 5 to 7, fix namespace keyword list")
if avg_correctness < 0.6:
    print("  ✗ Low correctness → tighten system prompt, add more specific policy chunks")
if avg_faithfulness < 0.6:
    print("  ✗ Low faithfulness → model may be hallucinating, add 'only use context' instruction")
if len(hallucinations) > 2:
    print(f"  ✗ {len(hallucinations)} hallucinations → upgrade namespace classifier to LLM-based")
if len(wrong_ns) > 0:
    print(f"  ✗ {len(wrong_ns)} wrong namespace hits → expand keyword list or use LLM classifier")

# --- Save ---
report_path = os.path.join(os.path.dirname(__file__), "eval_report.csv")
df.to_csv(report_path, index=False)
print(f"\nReport saved to eval/eval_report.csv\n")