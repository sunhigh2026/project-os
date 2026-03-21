function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// GET /api/github/:projectId/summary
export async function onRequestGet({ params, env }) {
  const { projectId } = params;

  const project = await env.DB.prepare('SELECT github_repo FROM projects WHERE id = ?').bind(projectId).first();
  if (!project?.github_repo) return json({ error: 'No GitHub repo configured' }, 404);

  const token = await env.DB.prepare("SELECT value FROM settings WHERE key = 'github_token'").first();
  if (!token?.value) return json({ summary: null });

  try {
    const res = await fetch(`https://api.github.com/repos/${project.github_repo}`, {
      headers: { 'Authorization': `token ${token.value}`, 'User-Agent': 'ProjectOS' },
    });

    if (!res.ok) return json({ summary: null });

    const data = await res.json();
    return json({
      summary: {
        name: data.full_name,
        description: data.description,
        language: data.language,
        stars: data.stargazers_count,
        forks: data.forks_count,
        open_issues: data.open_issues_count,
        updated_at: data.updated_at,
      },
    });
  } catch (e) {
    return json({ summary: null });
  }
}
