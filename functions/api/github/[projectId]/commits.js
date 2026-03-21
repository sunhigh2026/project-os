function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// GET /api/github/:projectId/commits
export async function onRequestGet({ params, env }) {
  const { projectId } = params;

  const project = await env.DB.prepare('SELECT github_repo FROM projects WHERE id = ?').bind(projectId).first();
  if (!project?.github_repo) return json({ error: 'No GitHub repo configured' }, 404);

  const token = await env.DB.prepare("SELECT value FROM settings WHERE key = 'github_token'").first();
  if (!token?.value) return json({ commits: [] });

  try {
    const res = await fetch(`https://api.github.com/repos/${project.github_repo}/commits?per_page=30`, {
      headers: { 'Authorization': `token ${token.value}`, 'User-Agent': 'ProjectOS' },
    });

    if (!res.ok) return json({ commits: [], error: `GitHub API ${res.status}` });

    const data = await res.json();
    const commits = data.map(c => ({
      sha: c.sha?.slice(0, 7),
      message: c.commit?.message,
      date: c.commit?.author?.date,
      author: c.commit?.author?.name,
    }));

    return json({ commits });
  } catch (e) {
    return json({ commits: [], error: e.message });
  }
}
