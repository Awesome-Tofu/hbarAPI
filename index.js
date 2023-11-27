const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const port = 3000;

// Function to generate a random filename
const generateRandomFilename = () => {
    const randomBytes = crypto.randomBytes(4).toString('hex');
    return `video_${randomBytes}.mp4`;
};


app.get('/',(req,res)=>{
    res.json({redirect:'/random'})
})


async function download(url, res){
    try {
        // The URL of the website

        // Make an HTTP request to the website
        const response = await axios.get(url);

        // Load the HTML into Cheerio
        const $ = cheerio.load(response.data);

        // Extract thumbnailUrl and contentUrl
        const scriptContent = $('script[type="application/ld+json"]').html();
        if (scriptContent) {
            const jsonContent = JSON.parse(scriptContent);
            const thumbnailUrl = jsonContent.thumbnailUrl;
            const contentUrl = jsonContent.contentUrl;
            const name = jsonContent.name;
            const uploadDate = jsonContent.uploadDate;
            const duration = jsonContent.duration;



            // Generate a random filename
            const randomFilename = generateRandomFilename();

            // Download the MP4 file with the random filename
            const mp4Response = await axios.get(contentUrl, { responseType: 'stream' });
            const mp4FilePath = path.resolve(randomFilename);
            const mp4WriteStream = fs.createWriteStream(mp4FilePath);

            // Pipe the MP4 data to the write stream
            mp4Response.data.pipe(mp4WriteStream);

            // Wait for the write stream to finish
            mp4WriteStream.on('finish', () => {
                console.log(`MP4 file downloaded and saved to: ${mp4FilePath}`);

                // Send the random filename as a response
                res.send({thum:thumbnailUrl, file: 'https://hentaibar.onrender.com/'+randomFilename, name: name, upload_date:uploadDate,duration:duration});

                // Schedule a function to delete the file after 5 minutes
                setTimeout(() => {
                    fs.unlink(mp4FilePath, (err) => {
                        if (err) {
                            console.error(`Error deleting file: ${mp4FilePath}`, err);
                        } else {
                            console.log(`File deleted: ${mp4FilePath}`);
                        }
                    });
                }, 5 * 60 * 1000); // 5 minutes in milliseconds
            });
        } else {
            console.log('Script content not found');
            res.status(500).send('Internal Server Error');
        }
    } catch (error) {
        console.error('Error fetching the website:', error.message);
        res.status(500).send('Internal Server Error');
    }
}

app.get('/random', async (req, res) => {
    try {
        const url = "https://hentaibar.com/random_video";
        await download(url, res);
    } catch (error) {
        res.status(500).json({err:error.message});
    }

});

// Serve the downloaded video file by filename
app.get('/:filename', (req, res) => {
    const requestedFilename = req.params.filename;
    const videoPath = path.resolve(requestedFilename);

    // Check if the file exists
    if (fs.existsSync(videoPath)) {
        // Set headers for the response
        res.setHeader('Content-Type', 'video/mp4');
        // res.download(videoPath, requestedFilename);
        res.sendFile(videoPath);
    } else {
        res.status(404).send('Video not found');
    }
});

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
