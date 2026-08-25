module.exports = async function(req, res) {
  const keyID = process.env.B2_KEY_ID || "0058aaeb5bf587b000000000e";
  const applicationKey = process.env.B2_APP_KEY || "K005jRUQFVU4U11vJS5hf1KmWmyrA0Y";

  try {
    // 1. Authorize with v2 API
    const credentials = Buffer.from(`${keyID}:${applicationKey}`).toString('base64');
    const authRes = await fetch('https://api.backblazeb2.com/b2api/v2/b2_authorize_account', {
      method: 'GET',
      headers: { 'Authorization': `Basic ${credentials}` }
    });
    
    if (!authRes.ok) {
      const errorText = await authRes.text();
      return res.status(500).json({ success: false, error: `B2 Auth failed: ${errorText}` });
    }
    
    const authData = await authRes.json();
    const apiUrl = authData.apiUrl;
    const downloadUrl = authData.downloadUrl;
    const authorizationToken = authData.authorizationToken;
    const bucketId = authData.allowed.bucketId;

    if (!bucketId) {
      return res.status(500).json({ success: false, error: 'No bucket ID found. Make sure this is an Application Key restricted to one bucket, not a Master Key.' });
    }

    // 2. List all file names with v2 API
    const listRes = await fetch(`${apiUrl}/b2api/v2/b2_list_file_names`, {
      method: 'POST',
      headers: { 
        'Authorization': authorizationToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        bucketId: bucketId,
        maxFileCount: 1000
      })
    });

    if (!listRes.ok) {
      const errorText = await listRes.text();
      return res.status(500).json({ success: false, error: `B2 List failed: ${errorText}` });
    }

    const listData = await listRes.json();
    const files = listData.files || [];

    // 3. Process files
    const games = files
      .filter(file => file.action === 'upload' && file.fileName.endsWith('.html'))
      .map(file => {
        const pathParts = file.fileName.split('/');
        const isFeatured = file.fileName.startsWith('featured/') || pathParts.includes('featured');
        const fileNameWithoutExt = pathParts[pathParts.length - 1].replace('.html', '');
        
        const title = fileNameWithoutExt
          .split(/[-_]/)
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');

        const gameUrl = `${downloadUrl}/file/${authData.allowed.bucketName}/${file.fileName}`;
        
        const matchingArt = files.find(f => 
          f.fileName.includes('artwork/') && 
          f.fileName.toLowerCase().includes(fileNameWithoutExt.toLowerCase())
        );
        
        const artworkUrl = matchingArt 
          ? `${downloadUrl}/file/${authData.allowed.bucketName}/${matchingArt.fileName}`
          : `https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=600&auto=format&fit=crop&q=80`;

        return {
          id: file.fileId,
          title: title,
          fileName: file.fileName,
          url: gameUrl,
          featured: isFeatured,
          cover: artworkUrl,
          category: isFeatured ? 'Featured' : (pathParts.length > 1 ? pathParts[0] : 'Arcade')
        };
      });

    return res.status(200).json({ success: true, games });

  } catch (error) {
    console.error('Server Error:', error);
    return res.status(500).json({ success: false, error: error.toString() });
  }
}
