module.exports = async function(req, res) {
  const keyID = process.env.B2_KEY_ID || "0058aaeb5bf587b000000000e";
  const applicationKey = process.env.B2_APP_KEY || "K005jRUQFVU4U11vJS5hf1KmWmyrA0Y";

  try {
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
      return res.status(500).json({ success: false, error: 'No bucket ID found.' });
    }

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

    const htmlFiles = files.filter(file => file.action === 'upload' && file.fileName.endsWith('.html'));

    const gamesPromises = htmlFiles.map(async file => {
      const pathParts = file.fileName.split('/');
      const isFeatured = file.fileName.startsWith('featured/') || pathParts.includes('featured');
      const fileNameWithoutExt = pathParts[pathParts.length - 1].replace('.html', '');
      
      const title = fileNameWithoutExt
        .split(/[-_]/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

      const gameUrl = `${downloadUrl}/file/${authData.allowed.bucketName}/${file.fileName}`;
      
      let coverUrl = `https://placehold.co/600x900/1f2937/ffffff?text=${encodeURIComponent(title)}&font=Montserrat`;

      try {
        const itunesRes = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(title)}&entity=software&limit=1`);
        if (itunesRes.ok) {
          const itunesData = await itunesRes.json();
          if (itunesData.results && itunesData.results.length > 0) {
            coverUrl = itunesData.results[0].artworkUrl512;
          }
        }
      } catch (e) {
      }

      return {
        id: file.fileId,
        title: title,
        fileName: file.fileName,
        url: gameUrl,
        featured: isFeatured,
        cover: coverUrl,
        category: isFeatured ? 'Featured' : (pathParts.length > 1 ? pathParts[0] : 'Arcade')
      };
    });

    const games = await Promise.all(gamesPromises);

    return res.status(200).json({ success: true, games });

  } catch (error) {
    return res.status(500).json({ success: false, error: error.toString() });
  }
}
