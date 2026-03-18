export default async function handler(req, res) {
  const token = process.env.VITE_WEBFLOW_API_TOKEN;
  const siteId = process.env.VITE_WEBFLOW_SITE_ID;

  try {
    // Get collections
    const colRes = await fetch(
      `https://api.webflow.com/v2/sites/${siteId}/collections`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const colData = await colRes.json();
    const archiveCol = colData.collections.find(
      c => c.displayName.toLowerCase() === 'archive'
    );

    if (!archiveCol) {
      return res.status(404).json({ error: 'Archive collection not found' });
    }

    // Get items
    const itemRes = await fetch(
      `https://api.webflow.com/v2/collections/${archiveCol.id}/items`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const itemData = await itemRes.json();

    const items = itemData.items.map(item => ({
      id: item.id,
      name: item.fieldData.name,
      slug: item.fieldData.slug,
      image: item.fieldData['cover-image']?.url || null,
    }));

    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json({ items });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}