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

    if (!workCol) {
      return res.status(404).json({ error: 'Work collection not found' });
    }

    const itemRes = await fetch(
      `https://api.webflow.com/v2/collections/${workCol.id}/items`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const itemData = await itemRes.json();

    const items = itemData.items.map(item => {
      const rawUrl = item.fieldData['cover-video-url'] || null;

      // Convert any Cloudflare Stream URL format to HLS manifest
      let videoUrl = rawUrl;
      if (rawUrl && rawUrl.includes('cloudflarestream.com')) {
        // Extract the video ID from any Cloudflare Stream URL format:
        // downloads/default.mp4  →  manifest/video.m3u8
        // Already an .m3u8       →  keep as-is
        if (!rawUrl.includes('.m3u8')) {
          const match = rawUrl.match(
            /cloudflarestream\.com\/([a-f0-9]+)\//
          );
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

      return {
        id: item.id,
        name: item.fieldData.name,
        slug: item.fieldData.slug,
        category: item.fieldData['category'] || null,
        videoUrl,
        year: item.fieldData['year'] || null,
        client: item.fieldData['client'] || null,
        description: item.fieldData['description'] || null,
        website: item.fieldData['website'] || null,
      };
    });

    return res.status(200).json({ items });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}