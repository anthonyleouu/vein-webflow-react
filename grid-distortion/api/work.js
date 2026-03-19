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

    // Log all collections to see exact names
    const allCollections = colData.collections.map(c => ({
      id: c.id,
      displayName: c.displayName,
      slug: c.slug
    }));

    const workCol = colData.collections.find(
      c => c.displayName.toLowerCase() === 'work' ||
           c.slug === 'work'
    );

    if (!workCol) {
      return res.status(404).json({
        error: 'Work collection not found',
        availableCollections: allCollections
      });
    }

    const itemRes = await fetch(
      `https://api.webflow.com/v2/collections/${workCol.id}/items`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const itemData = await itemRes.json();

    // Log first item to see exact field names
    const firstItem = itemData.items?.[0];

    const items = itemData.items.map(item => ({
      id: item.id,
      name: item.fieldData.name,
      slug: item.fieldData.slug,
      category: item.fieldData['category'] || null,
      videoUrl: item.fieldData['cover-video-url'] || null,
      year: item.fieldData['year'] || null,
      client: item.fieldData['client'] || null,
      description: item.fieldData['description'] || null,
      website: item.fieldData['website'] || null,
    }));

    return res.status(200).json({ items, debug: firstItem?.fieldData });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
