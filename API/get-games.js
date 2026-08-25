const B2 = require('backblaze-b2');

export default async function handler(req, res) {
    // 1. Initialize Backblaze client using SECURE Environment Variables
    const b2 = new B2({
        applicationKeyId: process.env.B2_KEY_ID, 
        applicationKey: process.env.B2_APP_KEY
    });

    try {
        // 2. Authorize with Backblaze
        await b2.authorize();

        // 3. Get the Bucket ID (Backblaze needs the ID, not just the name)
        const bucketResponse = await b2.getBucket({ bucketName: 'jdotgames' });
        const bucketId = bucketResponse.data.buckets[0].bucketId;

        // 4. List all files in the bucket
        const listResponse = await b2.listFileNames({
            bucketId: bucketId,
            startFileName: '',
            maxFileCount: 1000,
            delimiter: '' 
        });

        const files = listResponse.data.files;
        const games = [];

        // 5. Filter and format the raw files into game objects
        // We look for "index.html" files to identify root game folders
        files.forEach(file => {
            if (file.fileName.endsWith('/index.html')) {
                // Determine if it's featured based on the folder path
                const isFeatured = file.fileName.startsWith('featured/');
                
                // Extract a clean title from the folder name
                // e.g., "featured/cosmic-drift/index.html" -> "Cosmic Drift"
                const pathParts = file.fileName.split('/');
                const folderName = pathParts[pathParts.length - 2]; 
                const cleanTitle = folderName.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

                // Create the download URL (using Backblaze's public CDN format)
                // Note: You must ensure your bucket privacy is set to 'Public' in Backblaze settings
                const downloadUrl = `https://f005.backblazeb2.com/file/jdotgames/${file.fileName}`;

                games.push({
                    id: file.fileId,
                    title: cleanTitle,
                    folder: file.fileName.replace('/index.html', ''),
                    isFeatured: isFeatured,
                    genre: 'Arcade', // You can expand this later by adding a metadata JSON file in each game folder
                    url: downloadUrl
                });
            }
        });

        // 6. Send the clean data back to our front-end
        res.status(200).json(games);

    } catch (error) {
        console.error("Backblaze API Error:", error);
        res.status(500).json({ error: 'Failed to fetch games from Backblaze' });
    }
}
