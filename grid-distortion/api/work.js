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

    const workCol = colData.collections.find(
      c => c.displayName.toLowerCase() === 'work' || c.slug === 'work'
    );
    const catCol = colData.collections.find(
      c => c.displayName.toLowerCase() === 'categories' || c.slug === 'categories'
    );

    if (!workCol) {
      return res.status(404).json({ error: 'Work collection not found' });
    }

    // Fetch categories if collection exists
    let categoryMap = {};
    if (catCol) {
      const catRes = await fetch(
        `https://api.webflow.com/v2/collections/${catCol.id}/items`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const catData = await catRes.json();
      catData.items?.forEach(cat => {
        categoryMap[cat.id] = cat.fieldData.name;
      });
    }

    const itemRes = await fetch(
      `https://api.webflow.com/v2/collections/${workCol.id}/items`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const itemData = await itemRes.json();

    const items = itemData.items.map(item => {
      const rawUrl = item.fieldData['cover-video-url'] || null;

      let videoUrl = rawUrl;
      if (rawUrl && rawUrl.includes('cloudflarestream.com')) {
        if (!rawUrl.includes('.m3u8')) {
          const match = rawUrl.match(/cloudflarestream\.com\/([a-f0-9]+)\//);
          if (match) {
            const videoId = match[1];
            const customer = rawUrl.match(
              /(https:\/\/customer-[^/]+\.cloudflarestream\.com)/
            )?.[1];
            if (customer) {
              videoUrl = `${customer}/${videoId}/manifest/video.m3u8`;
            }
          }
        }
      }

      // Multi-image gallery
      const galleryRaw = item.fieldData['gallery'] || [];
      const gallery = Array.isArray(galleryRaw)
        ? galleryRaw.map(img => img.url || img.fileUrl || null).filter(Boolean)
        : [];

      // Multi-reference categories — returns array of IDs
      const categoryIds = item.fieldData['roles'] || [];
      const categories = Array.isArray(categoryIds)
        ? categoryIds.map(id => categoryMap[id] || id).filter(Boolean)
        : item.fieldData['category']
          ? [item.fieldData['category']]
          : [];

      return {
        id: item.id,
        name: item.fieldData.name,
        slug: item.fieldData.slug,
        category: item.fieldData['category'] || null, // keep old field for backward compat
        categories, // new array
        videoUrl,
        year: item.fieldData['year'] || null,
        client: item.fieldData['client'] || null,
        description: item.fieldData['description'] || null,
        website: item.fieldData['website'] || null,
        gallery,
      };
    });

    return res.status(200).json({ items });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}