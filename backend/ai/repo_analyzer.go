package ai

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/go-resty/resty/v2"
)

type RepoFile struct {
	Name    string `json:"name"`
	Path    string `json:"path"`
	Type    string `json:"type"` // "file" or "dir"
	Content string `json:"content,omitempty"`
}

// key entry point filenames to look for
var entryPoints = []string{
	"main.go", "main.py", "index.js", "index.ts", "app.go",
	"app.py", "app.js", "server.go", "server.js", "server.py",
	"cmd/server/main.go", "src/index.js", "src/main.js",
	"src/app.js", "src/App.jsx",
}

// key dirs to scan for important files
var importantDirs = []string{
	"", "src", "cmd", "internal", "api", "handlers",
	"routes", "controllers", "services", "pkg",
}

func parseGitHubURL(url string) (owner, repo string, err error) {
	url = strings.TrimSuffix(url, "/")
	url = strings.TrimPrefix(url, "https://github.com/")
	url = strings.TrimPrefix(url, "http://github.com/")
	parts := strings.Split(url, "/")
	if len(parts) < 2 {
		return "", "", fmt.Errorf("invalid GitHub URL: %s", url)
	}
	return parts[0], parts[1], nil
}

func fetchGitHubContents(owner, repo, path string) ([]RepoFile, error) {
	client := resty.New()
	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/contents/%s", owner, repo, path)

	resp, err := client.R().
		SetHeader("Accept", "application/vnd.github.v3+json").
		SetHeader("User-Agent", "FlowForge").
		Get(url)
	if err != nil {
		return nil, err
	}

	var files []RepoFile
	if err := json.Unmarshal(resp.Body(), &files); err != nil {
		// might be a single file
		var single RepoFile
		if err2 := json.Unmarshal(resp.Body(), &single); err2 == nil {
			return []RepoFile{single}, nil
		}
		return nil, err
	}
	return files, nil
}

func fetchFileContent(owner, repo, path string) (string, error) {
	client := resty.New()
	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/contents/%s", owner, repo, path)

	resp, err := client.R().
		SetHeader("Accept", "application/vnd.github.v3+json").
		SetHeader("User-Agent", "FlowForge").
		Get(url)
	if err != nil {
		return "", err
	}

	var file struct {
		Content  string `json:"content"`
		Encoding string `json:"encoding"`
	}
	if err := json.Unmarshal(resp.Body(), &file); err != nil {
		return "", err
	}

	if file.Encoding == "base64" {
		decoded, err := base64.StdEncoding.DecodeString(
			strings.ReplaceAll(file.Content, "\n", ""),
		)
		if err != nil {
			return "", err
		}
		return string(decoded), nil
	}
	return file.Content, nil
}

func collectRepoContext(owner, repo string) string {
	var context strings.Builder
	seen := map[string]bool{}

	// fetch README first
	if content, err := fetchFileContent(owner, repo, "README.md"); err == nil {
		context.WriteString("=== README.md ===\n")
		if len(content) > 2000 {
			content = content[:2000]
		}
		context.WriteString(content + "\n\n")
	}

	// try entry point files
	for _, ep := range entryPoints {
		if seen[ep] {
			continue
		}
		content, err := fetchFileContent(owner, repo, ep)
		if err == nil {
			seen[ep] = true
			context.WriteString(fmt.Sprintf("=== %s ===\n", ep))
			if len(content) > 1500 {
				content = content[:1500]
			}
			context.WriteString(content + "\n\n")
		}
	}

	// scan important dirs for more files
	for _, dir := range importantDirs {
		if context.Len() > 8000 {
			break
		}
		files, err := fetchGitHubContents(owner, repo, dir)
		if err != nil {
			continue
		}
		for _, f := range files {
			if seen[f.Path] || f.Type != "file" {
				continue
			}
			// only pick Go, JS, TS, Python files
			if !isCodeFile(f.Name) {
				continue
			}
			content, err := fetchFileContent(owner, repo, f.Path)
			if err != nil {
				continue
			}
			seen[f.Path] = true
			context.WriteString(fmt.Sprintf("=== %s ===\n", f.Path))
			if len(content) > 1000 {
				content = content[:1000]
			}
			context.WriteString(content + "\n\n")
			if context.Len() > 8000 {
				break
			}
		}
	}

	return context.String()
}

func isCodeFile(name string) bool {
	exts := []string{".go", ".js", ".ts", ".jsx", ".tsx", ".py", ".java", ".rb"}
	for _, ext := range exts {
		if strings.HasSuffix(name, ext) {
			return true
		}
	}
	return false
}

// AnalyzeRepo fetches a GitHub repo and generates a workflow diagram
func AnalyzeRepo(githubURL string) (*GenerateResult, string, error) {
	owner, repo, err := parseGitHubURL(githubURL)
	if err != nil {
		return nil, "", err
	}

	// collect code context
	context := collectRepoContext(owner, repo)
	if context == "" {
		return nil, "", fmt.Errorf("could not fetch repo contents — make sure it's a public repo")
	}

	repoName := fmt.Sprintf("%s/%s", owner, repo)

	prompt := fmt.Sprintf(`You are a software architect. Analyze this GitHub repository and generate a workflow diagram showing how the code flows — from entry point to key operations.

Repository: %s

Code Context:
%s

Generate a workflow showing the main code flow (request handling, processing steps, data flow, etc.).

Rules:
- Generate 5-8 steps showing the actual code flow
- Step names should reflect what the code actually does (based on the files above)
- Use depends_on to show the sequence
- Be specific to THIS repo, not generic
- Return ONLY valid JSON

Example format:
{
  "steps": [
    {"name": "HTTP Request In", "depends_on": []},
    {"name": "Auth Middleware", "depends_on": ["HTTP Request In"]},
    {"name": "Route Handler", "depends_on": ["Auth Middleware"]},
    {"name": "DB Query", "depends_on": ["Route Handler"]},
    {"name": "Return Response", "depends_on": ["DB Query"]}
  ]
}

Now analyze %s and return the JSON:`, repoName, context, repoName)

	content, err := callGroq(prompt)
	if err != nil {
		return nil, repoName, err
	}

	content = strings.TrimSpace(content)
	start := strings.Index(content, "{")
	end := strings.LastIndex(content, "}")
	if start == -1 || end == -1 {
		return nil, repoName, fmt.Errorf("no JSON in AI response")
	}
	content = content[start : end+1]

	var result GenerateResult
	if err := json.Unmarshal([]byte(content), &result); err != nil {
		return nil, repoName, fmt.Errorf("failed to parse AI response: %w", err)
	}

	return &result, repoName, nil
}
