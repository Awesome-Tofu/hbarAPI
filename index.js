const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require("dotenv").config();
const app = express();
const port = 3000;

const hostUrl = process.env.HOSTURL;
const mainUrl = process.env.MAIN_URL;


// Function to generate a random filename
const generateRandomFilename = () => {
    const randomBytes = crypto.randomBytes(4).toString('hex');
    return `video_${randomBytes}.mp4`;
};

app.get('/delall', (req, res) => {
    const directoryPath = __dirname;

    // Filter files to include only MP4 files
    const mp4Files = fs.readdirSync(directoryPath).filter(file => file.endsWith('.mp4'));

    // Delete each MP4 file
    mp4Files.forEach(file => {
        const filePath = path.join(directoryPath, file);
        fs.unlinkSync(filePath);
        console.log(`Deleted file: ${filePath}`);
    });

    res.json({ status: `Cleared ${mp4Files.join(', ')}` });
});

// Function to handle file deletion after 5 minutes
const scheduleFileDeletion = (filePath) => {
    setTimeout(() => {
        fs.unlink(filePath, (err) => {
            if (err) {
                console.error(`Error deleting file: ${filePath}`, err);
            } else {
                console.log(`File deleted: ${filePath}`);
            }
        });
    }, 5 * 60 * 1000); // 5 minutes in milliseconds
};


// Function to scrape search results
const scrapeSearchResults = async (searchUrl) => {
    try {
        const response = await axios.get(searchUrl);
        const $ = cheerio.load(response.data);

        const results = [];

        $('.cards__item').each((index, element) => {
            const card = $(element);
            const duration = card.find('.card__label.card__label--primary').text().trim()
            const name = card.find('.card__title').text().trim();
            const thumbnailUrl = card.find('.card__image').attr('src');
            const videoUrl = card.find('a').attr('href').replace(`${mainUrl}videos/`,`${hostUrl}watch?url=`);

            results.push({
                name,
                thumbnailUrl,
                duration,
                url: videoUrl,
            });
        });

        return results;
    } catch (error) {
        console.error('Error scraping search results:', error.message);
        throw error;
    }
};


const download = async (url, res) => {
    try {
        const response = await axios.get(url);
        const $ = cheerio.load(response.data);

        const scriptContent = $('script[type="application/ld+json"]').html();
        if (scriptContent) {
            const jsonContent = JSON.parse(scriptContent);
            const thumbnailUrl = jsonContent.thumbnailUrl;
            const contentUrl = jsonContent.contentUrl;
            const name = jsonContent.name;
            const uploadDate = jsonContent.uploadDate;
            const duration = formatDuration(jsonContent.duration);

            const randomFilename = generateRandomFilename();
            const mp4FilePath = path.resolve(randomFilename);

            const mp4Response = await axios.get(contentUrl, { responseType: 'stream' });
            const mp4WriteStream = fs.createWriteStream(mp4FilePath);

            mp4Response.data.pipe(mp4WriteStream);

            mp4WriteStream.on('finish', () => {
                console.log(`MP4 file downloaded and saved to: ${mp4FilePath}`);

                // Send the response with details
                res.json({
                    thumbnailUrl,
                    file: `${hostUrl}${randomFilename}`,
                    name,
                    upload_date: uploadDate,
                    duration,
                });

                // Schedule file deletion after 5 minutes
                scheduleFileDeletion(mp4FilePath);
            });
        } else {
            console.log('Script content not found');
            res.status(500).send('Internal Server Error');
        }
    } catch (error) {
        console.error('Error fetching the website:', error.message);
        res.status(500).json({ error: 'Internal Server Error', message: error.message });
    }
};

const formatDuration = (durationString) => {
    const match = durationString.match(/PT(\d+H)?(\d+M)?(\d+S)?/);

    const hours = (match[1] || 0) && parseInt(match[1], 10);
    const minutes = (match[2] || 0) && parseInt(match[2], 10);
    const seconds = (match[3] || 0) && parseInt(match[3], 10);

    const formattedDuration = [hours, minutes, seconds]
        .filter(Boolean)
        .map((value) => String(value).padStart(2, '0'))
        .join(':');

    return formattedDuration;
};



app.get('/', (req, res) => {
    res.json({ random: '/random', search:'/search/overflow/1',tags:'/tags',getTag: '/tags/loli/1',trending:'/trending/1',popular:'/popular/1',top_rated:'/top-rated/1',longest:'/longest/1',most_commented:'/most-commented/1'});
});

app.get('/random', async (req, res) => {
    try {
        const Random_url = process.env.RANDOM_URL;
        await download(Random_url, res);
    } catch (error) {
        res.status(500).json({ err: error.message });
    }
});



app.get('/search/:query/:page', async (req, res) => {
    try {
        const query = req.params.query;
        const replacedQuery = query.replace(/ /g, '-');
        const page = req.params.page;
        const searchUrl = `${mainUrl}search/${replacedQuery}/${page}`;
        const searchResults = await scrapeSearchResults(searchUrl);
        res.json({ results: searchResults });
    } catch (error) {
        res.status(500).json({ error: 'Internal Server Error', message: error.message });
    }
});

app.get('/tags/:tag/:page', async (req, res) => {
    try {
        const tag = req.params.tag;
        const replacedTag = tag.replace(/ /g, '-');
        const page = req.params.page;
        const searchUrl = `${mainUrl}tags/${replacedTag}/${page}`;

        const searchResults = await scrapeSearchResults(searchUrl);
        res.json({ results: searchResults });
    } catch (error) {
        res.status(500).json({ error: 'Internal Server Error', message: error.message });
    }
});

app.get('/tags', async (req,res)=>{
    const response = await axios.get(mainUrl);
    const $ = cheerio.load(response.data);
    const tagsArray = $('.list__title').map((index, element) => $(element).text()).get();
    const tagsJson = {
        tags: tagsArray,
    };
    res.json(tagsJson);
    return
})

app.get('/watch',async(req,res)=>{
    const url = req.query.url;
    try {
        const watchUrl = `${mainUrl}videos/${url}`;
        await download(watchUrl, res);
    } catch (error) {
        console.error(error);
        res.status(500).json({ err: error.message });
    }
})

app.get('/trending/:page',async(req,res)=>{
    try {
        const page = req.params.page;
        const searchUrl = `${mainUrl}${page}`;

        const searchResults = await scrapeSearchResults(searchUrl);
        res.json({ results: searchResults });
    } catch (error) {
        res.status(500).json({ error: 'Internal Server Error', message: error.message });
    }
})

app.get('/popular/:page',async(req,res)=>{
    try {
        const page = req.params.page;
        const searchUrl = `${mainUrl}most-popular/${page}`;

        const searchResults = await scrapeSearchResults(searchUrl);
        res.json({ results: searchResults });
    } catch (error) {
        res.status(500).json({ error: 'Internal Server Error', message: error.message });
    }
})

app.get('/top-rated/:page',async(req,res)=>{
    try {
        const page = req.params.page;
        const searchUrl = `${mainUrl}top-rated/${page}`;

        const searchResults = await scrapeSearchResults(searchUrl);
        res.json({ results: searchResults });
    } catch (error) {
        res.status(500).json({ error: 'Internal Server Error', message: error.message });
    }
})

app.get('/longest/:page',async(req,res)=>{
    try {
        const page = req.params.page;
        const searchUrl = `${mainUrl}longest/${page}`;

        const searchResults = await scrapeSearchResults(searchUrl);
        res.json({ results: searchResults });
    } catch (error) {
        res.status(500).json({ error: 'Internal Server Error', message: error.message });
    }
})

app.get('/most-commented/:page',async(req,res)=>{
    try {
        const page = req.params.page;
        const searchUrl = `${mainUrl}most-commented/${page}`;

        const searchResults = await scrapeSearchResults(searchUrl);
        res.json({ results: searchResults });
    } catch (error) {
        res.status(500).json({ error: 'Internal Server Error', message: error.message });
    }
})


app.get('/:filename', (req, res) => {
    const requestedFilename = req.params.filename;
    const videoPath = path.resolve(requestedFilename);

    if (fs.existsSync(videoPath)) {
        res.setHeader('Content-Type', 'video/mp4');
        res.sendFile(videoPath);
    } else {
        res.status(404).send('Video not found');
    }
});

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
