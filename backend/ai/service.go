package ai

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"github.com/go-resty/resty/v2"
)

const groqURL = "https://api.groq.com/openai/v1/chat/completions"
const model = "llama-3.3-70b-versatile"

type GeneratedStep struct {
	Name      string   `json:"name"`
	DependsOn []string `json:"depends_on"`
}

type GenerateResult struct {
	Steps []GeneratedStep `json:"steps"`
}

type FailureAnalysis struct {
	Reason     string `json:"reason"`
	Suggestion string `json:"suggestion"`
}

func callGroq(prompt string) (string, error) {
	apiKey := os.Getenv("GROQ_API_KEY")
	if apiKey == "" {
		return "", fmt.Errorf("GROQ_API_KEY not set")
	}

	body := map[string]interface{}{
		"model": model,
		"messages": []map[string]string{
			{"role": "user", "content": prompt},
		},
		"temperature": 0.3,
	}

	client := resty.New()
	resp, err := client.R().
		SetHeader("Authorization", "Bearer "+apiKey).
		SetHeader("Content-Type", "application/json").
		SetBody(body).
		Post(groqURL)

	if err != nil {
		return "", err
	}

	var result struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}

	if err := json.Unmarshal(resp.Body(), &result); err != nil {
		return "", err
	}

	if len(result.Choices) == 0 {
		return "", fmt.Errorf("no response from Groq")
	}

	return result.Choices[0].Message.Content, nil
}

// GenerateSteps takes a plain English description and returns workflow steps
func GenerateSteps(description string) (*GenerateResult, error) {
	prompt := fmt.Sprintf(`You are a workflow designer. Given a description, generate workflow steps as JSON.

Description: "%s"

Rules:
- Generate 4-7 steps
- Each step should be a clear, short action (2-4 words)
- Set depends_on to show which steps must complete before this one
- First step(s) have empty depends_on
- Return ONLY valid JSON, no explanation

Example output:
{
  "steps": [
    {"name": "Fetch Data", "depends_on": []},
    {"name": "Validate Input", "depends_on": ["Fetch Data"]},
    {"name": "Process Records", "depends_on": ["Validate Input"]},
    {"name": "Save Results", "depends_on": ["Process Records"]},
    {"name": "Send Notification", "depends_on": ["Save Results"]}
  ]
}

Now generate steps for: "%s"
Return ONLY the JSON object.`, description, description)

	content, err := callGroq(prompt)
	if err != nil {
		return nil, err
	}

	// extract JSON from response
	content = strings.TrimSpace(content)
	start := strings.Index(content, "{")
	end := strings.LastIndex(content, "}")
	if start == -1 || end == -1 {
		return nil, fmt.Errorf("no JSON found in response")
	}
	content = content[start : end+1]

	var result GenerateResult
	if err := json.Unmarshal([]byte(content), &result); err != nil {
		return nil, fmt.Errorf("failed to parse AI response: %w", err)
	}

	return &result, nil
}

// AnalyzeFailure takes step name + logs and returns AI diagnosis
func AnalyzeFailure(stepName, logs string) (*FailureAnalysis, error) {
	prompt := fmt.Sprintf(`You are a DevOps expert. A workflow step failed. Analyze and explain in simple words.

Step Name: "%s"
Execution Logs:
%s

Respond ONLY with this JSON (no explanation outside JSON):
{
  "reason": "one sentence explaining why it failed",
  "suggestion": "one concrete actionable fix"
}`, stepName, logs)

	content, err := callGroq(prompt)
	if err != nil {
		return nil, err
	}

	content = strings.TrimSpace(content)
	start := strings.Index(content, "{")
	end := strings.LastIndex(content, "}")
	if start == -1 || end == -1 {
		return nil, fmt.Errorf("no JSON found in response")
	}
	content = content[start : end+1]

	var result FailureAnalysis
	if err := json.Unmarshal([]byte(content), &result); err != nil {
		return nil, fmt.Errorf("failed to parse AI response: %w", err)
	}

	return &result, nil
}
