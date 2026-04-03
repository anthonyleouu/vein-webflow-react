export default async function handler(req, res) {
  const token  = process.env.VITE_WEBFLOW_API_TOKEN;
  const siteId = process.env.VITE_WEBFLOW_SITE_ID;

  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    const colRes  = await fetch(`https://api.webflow.com/v2/sites/${siteId}/collections`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const colData = await colRes.json();
    const col     = colData.collections.find(c =>
      c.displayName.toLowerCase() === 'archive' || c.slug === 'archive'
    );
    if (!col) return res.status(404).json({ error: 'Archive collection not found' });

    const itemRes  = await fetch(`https://api.webflow.com/v2/collections/${col.id}/items`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const itemData = await itemRes.json();

    const items = itemData.items.map(item => ({
      id:          item.id,
      name:        item.fieldData.name,
      slug:        item.fieldData.slug,
      count:       item.fieldData.count   || null,
      title:       item.fieldData.title   || null,
      description: item.fieldData.description || null,
      image:       item.fieldData.image?.url || null,
    }));

    return res.status(200).json({ items });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}