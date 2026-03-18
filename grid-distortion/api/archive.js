export default async function handler(req, res) {
  const token = process.env.VITE_WEBFLOW_API_TOKEN;
  const siteId = process.env.VITE_WEBFLOW_SITE_ID;

  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    const colRes = await fetch(
      `https://api.webflow.com/v2/sites/${siteId}/collections`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const colData = await colRes.json();

    // Log all collection names so we can see exactly what Webflow returns
    const names = colData.collections.map(c => c.displayName);
    console.log('Collection names:', names);

    const archiveCol = colData.collections.find(
      c => c.displayName.toLowerCase().includes('archive')
    );

    if (!archiveCol) {
      return res.status(404).json({ 
        error: 'Archive collection not found',
        availableCollections: names
      });
    }

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
  video: item.fieldData['cover-video'] || null,
  creator: item.fieldData['creator'] || null,
  description: item.fieldData['description'] || null,
}));

    return res.status(200).json({ items });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}