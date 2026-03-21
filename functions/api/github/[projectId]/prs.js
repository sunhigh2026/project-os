function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// GET /api/github/:projectId/prs
export async function onRequestGet({ params, env }) {
  const { projectId } = params;

  const project = await env.DB.prepare('SELECT github_repo FROM projects WHERE id = ?').bind(projectId).first();
  if (!project?.github_repo) return json({ error: 'No GitHub repo configured' }, 404);

  const token = await env.DB.prepare("SELECT value FROM settings WHERE key = 'github_token'").first();
  if (!token?.value) return json({ prs: [] });

  try {
    const res = await fetch(`https://api.github.com/repos/${project.github_repo}/pulls?state=open`, {
      headers: { 'Authorization': `token ${token.value}`, 'User-Agent': 'ProjectOS' },
    });

    if (!res.ok) return json({ prs: [] });

    const data = await res.json();
    const prs = data.map(pr => ({
      number: pr.number,
      title: pr.title,
      url: pr.html_url,
      created_at: pr.created_at,
      user: pr.user?.login,
    }));

    return json({ prs });
  } catch (e) {
    return json({ prs: [] });
  }
}
