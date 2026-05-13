Return JSON only with this shape:

```json
{
  "verdict": "approve | needs_changes | blocked",
  "summary": "string",
  "findings": [
    {
      "severity": "critical | major | minor | note",
      "category": "correctness | security | tests | maintainability | docs | other",
      "location": "string",
      "evidence": "string",
      "issue": "string",
      "impact": "string",
      "rationale": "string",
      "suggested_change": "string",
      "confidence": "high | medium | low",
      "blocking": "boolean"
    }
  ],
  "needs_verification": [
    {
      "hypothesis": "string",
      "how_to_verify": "string"
    }
  ],
  "missing_context": ["string"]
}
```

