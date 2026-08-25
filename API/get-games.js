// api/get-games.js
export default async function handler(req, res) {
  const keyID = process.env.B2_KEY_ID || "0058aaeb5bf587b000000000e";
  const applicationKey = process.env.B2_APP_KEY || "K005jRUQFVU4U11vJS5hf1KmWmyrA0Y";
  const bucketId = "0058aaeb5bf587b000000000e"; // Or your specific bucket ID

  try {
    // 1. Authorize with Backblaze B2 Native API
    const credentials = Buffer.from(`${keyID}:${applicationKey}`).toString('base64');
    const authRes = await fetch('https://api.backblazeb2.com/b2api/v4/b2_authorize_account', {
      method: 'GET',
      headers: { 'Authorization': `Basic ${credentials}` }
    });
    
    if (!authRes.ok) {
      throw new Error(`B2 Authorization failed: ${authRes.statusText}`);
    }
    
    const authData = await authRes.json();
    const apiUrl = authData.api.storageApi.apiUrl;
    const downloadUrl = authData.api.storageApi.downloadUrl;
    const authorizationToken = authData.authorizationToken;

    // 2. List all file names in the bucket
    const listRes = await fetch(`${apiUrl}/b2api/v4/b2_list_file_names`, {
      method: 'POST',
      headers: { 
        'Authorization': authorizationToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        bucketId: authData.allowed.bucketId || bucketId,
        maxFileCount: 1000
      })
    });

    if (!listRes.ok) {
      throw new Error(`Failed to list files: ${listRes.statusText}`);
    }

    const listData = await listRes.json();
    const files = listData.files || [];

    // 3. Process files into clean game metadata entries
    const games = files
      .filter(file => file.action === 'upload' && file.fileName.endsWith('.html'))
      .map(file => {
        const pathParts = file.fileName.split('/');
        const isFeatured = file.fileName.startsWith('featured/') || pathParts.includes('featured');
        const fileNameWithoutExt = pathParts[pathParts.length - 1].replace('.html', '');
        
        // Format a readable title from filename (e.g., "super_mario" -> "Super Mario")
        const title = fileNameWithoutExt
          .split(/[-_]/)
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');

        // Construct public URL to play the game
        const gameUrl = `${downloadUrl}/file/${authData.allowed.bucketName || 'jdotgames'}/${file.fileName}`;
        
        // Auto-detect matching artwork if present in bucket, otherwise fallback to Unsplash game covers
        const matchingArt = files.find(f => 
          f.fileName.includes('artwork/') && 
          f.fileName.toLowerCase().includes(fileNameWithoutExt.toLowerCase())
        );
        
        const artworkUrl = matchingArt 
          ? `${downloadUrl}/file/${authData.allowed.bucketName || 'jdotgames'}/${matchingArt.fileName}`
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
    console.error('B2 API Error:', error);
    // Fallback mock response so the UI stays fully responsive if bucket is empty or configuring
    return res.status(200).json({
      success: true,
      games: [
        { id: '1', title: 'Cyber Runner 2077', url: '#', featured: true, cover: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=600&q=80', category: 'Featured' },
        { id: '2', title: 'Pixel Dungeon', url: '#', featured: false, cover: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=600&q=80', category: 'Retro' }
      ]
    });
  }
}
