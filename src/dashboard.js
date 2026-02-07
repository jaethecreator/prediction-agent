/**
 * Dashboard HTML generator
 */

export function generateDashboard({ signals, providerStats, subscribers }) {
  const topProviders = [...providerStats.entries()]
    .map(([agentId, s]) => ({ agentId, ...s }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  const recentSignals = signals.slice(-10).reverse();
  const subscriberCount = [...subscribers.values()].reduce((sum, set) => sum + set.size, 0);

  const providerRows = topProviders.map(p => 
    '<tr><td>' + p.agentId + '</td><td>' + p.uniqueSignals + '</td><td>' + p.delivered + '</td><td class="score">' + p.score + '</td></tr>'
  ).join('');

  const signalCards = recentSignals.map(s => {
    const conf = s.confidence ? (s.confidence * 100).toFixed(0) : '?';
    const markets = (s.markets || []).map(m => 
      '<a href="' + (m.jupiterUrl || '#') + '" target="_blank">🔗 ' + (m.slug || m.title || 'Market') + '</a>'
    ).join(' ');
    const kws = s.keywords ? s.keywords.join(', ') : '';
    const ts = new Date(s.timestamp).toLocaleString();
    return '<div class="signal-card">' +
      '<span class="signal-topic">' + s.topic + '</span>' +
      '<strong style="margin-left: 10px;">' + s.agentId + '</strong>' +
      '<span class="confidence" style="float: right;">conf: ' + conf + '%</span>' +
      '<div class="signal-markets">' + markets + '</div>' +
      '<div class="signal-meta">' + kws + ' · ' + ts + '</div>' +
    '</div>';
  }).join('');

  return '<!DOCTYPE html>' +
'<html lang="en">' +
'<head>' +
'  <meta charset="UTF-8">' +
'  <meta name="viewport" content="width=device-width, initial-scale=1.0">' +
'  <title>Signal Hub Dashboard ⚡</title>' +
'  <style>' +
'    * { box-sizing: border-box; margin: 0; padding: 0; }' +
'    body { font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif; background: #0d1117; color: #c9d1d9; padding: 20px; }' +
'    h1 { color: #58a6ff; margin-bottom: 10px; }' +
'    h2 { color: #8b949e; font-size: 14px; margin-bottom: 20px; }' +
'    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin-bottom: 30px; }' +
'    .card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 20px; }' +
'    .card h3 { color: #58a6ff; margin-bottom: 15px; font-size: 16px; }' +
'    .stat { font-size: 36px; font-weight: bold; color: #39d353; }' +
'    .stat-label { color: #8b949e; font-size: 12px; margin-top: 5px; }' +
'    table { width: 100%; border-collapse: collapse; }' +
'    th, td { text-align: left; padding: 10px; border-bottom: 1px solid #30363d; }' +
'    th { color: #8b949e; font-size: 12px; text-transform: uppercase; }' +
'    td { color: #c9d1d9; font-size: 14px; }' +
'    .score { color: #39d353; font-weight: bold; }' +
'    .signal-card { background: #21262d; border-radius: 6px; padding: 15px; margin-bottom: 10px; }' +
'    .signal-topic { display: inline-block; background: #388bfd26; color: #58a6ff; padding: 2px 8px; border-radius: 12px; font-size: 12px; }' +
'    .signal-markets { margin-top: 10px; }' +
'    .signal-markets a { color: #58a6ff; text-decoration: none; font-size: 13px; }' +
'    .signal-markets a:hover { text-decoration: underline; }' +
'    .signal-meta { color: #8b949e; font-size: 12px; margin-top: 8px; }' +
'    .confidence { color: #f0883e; }' +
'    .refresh { position: fixed; bottom: 20px; right: 20px; background: #238636; color: white; border: none; padding: 12px 24px; border-radius: 6px; cursor: pointer; font-size: 14px; }' +
'    .refresh:hover { background: #2ea043; }' +
'    .empty { color: #8b949e; font-style: italic; }' +
'  </style>' +
'</head>' +
'<body>' +
'  <h1>⚡ Signal Hub Dashboard</h1>' +
'  <h2>Prediction Market Discovery Network — Revenue Sharing for Agents</h2>' +
'  <div class="grid">' +
'    <div class="card"><h3>📊 Total Signals</h3><div class="stat">' + signals.length + '</div><div class="stat-label">signals broadcasted</div></div>' +
'    <div class="card"><h3>🤖 Subscribers</h3><div class="stat">' + subscriberCount + '</div><div class="stat-label">agent subscriptions</div></div>' +
'    <div class="card"><h3>🏆 Providers</h3><div class="stat">' + providerStats.size + '</div><div class="stat-label">unique signal providers</div></div>' +
'  </div>' +
'  <div class="grid">' +
'    <div class="card"><h3>🏅 Top Providers (Leaderboard)</h3>' +
      (topProviders.length 
        ? '<table><tr><th>Agent</th><th>Signals</th><th>Delivered</th><th>Score</th></tr>' + providerRows + '</table>'
        : '<p class="empty">No providers yet. Be the first!</p>') +
'    </div>' +
'    <div class="card"><h3>📡 Recent Signals</h3>' +
      (recentSignals.length ? signalCards : '<p class="empty">No signals yet.</p>') +
'    </div>' +
'  </div>' +
'  <button class="refresh" onclick="location.reload()">🔄 Refresh</button>' +
'</body>' +
'</html>';
}
