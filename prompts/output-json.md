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
      "issue": "string",
      "rationale": "string",
      "suggested_change": "string"
    }
  ],
  "missing_context": ["string"]
}
```

