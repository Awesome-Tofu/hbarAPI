const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
require("dotenv").config();
const app = express();
const port = 3000;
const mongodb = require('mongodb');
const MongoClient = mongodb.MongoClient;
const GridFSBucket = mongodb.GridFSBucket;

const hostUrl = process.env.HOSTURL;
const mainUrl = process.env.MAIN_URL;

let gfs;
let dtb;

const MONGODB_URI = 'mongodb+srv://kazuha321:kazuha321@cluster0.oafdfob.mongodb.net/?retryWrites=true&w=majority'
async function connectToDatabase() {
    try {
        const client = await MongoClient.connect(MONGODB_URI);
        console.log('Connected to Database');
        dtb = client.db('HBAR');
        gfs = new mongodb.GridFSBucket(dtb, {
        bucketName: 'uploads'
        });
        return {'dtb':dtb, 'gfs':gfs};
    } catch (err) {
        console.error(err);
    }
}


// Function to generate a random filename
// function generateRandomFilename() {
//     return `${Date.now()}-${Math.round(Math.random() * 1E9)}.mp4`;
// }

app.get('/delall', async (req, res) => {
    try {
        const client = await MongoClient.connect(MONGODB_URI);
        const dtb = client.db('HBAR');
        const collections = await dtb.listCollections().toArray();

        // Fetch all files from the 'uploads' collection
        const files = await dtb.collection('uploads.files').find().toArray();

        // If no files are present, send a response saying 'No videos present'
        if (files.length === 0) {
            return res.json({ message: 'No videos present' });
        }

        // Store the names of the files in an array
        const fileNames = files.map(file => file.filename);

        // Drop all collections
        for (let collection of collections) {
            await dtb.collection(collection.name).drop();
        }

        res.send({ message: 'All collections deleted', deletedVideos: fileNames });
    } catch (err) {
        console.log(err);
        res.status(500).send(err);
    }
});



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
    const dtbclient = await connectToDatabase();
    const dtb = dtbclient.dtb;
    if (!dtb) {
        return res.status(500).json({ error: 'Database not initialized' });
    }
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

            const formattedFilename = `vid${name.replace(/ /g, '-')}.mp4`;

            const bucket = new GridFSBucket(dtb, {
                bucketName: 'uploads'
            });

            // Check if file already exists
            const files = await bucket.find({ filename: formattedFilename }).toArray();
            if (files.length > 0) {
                console.log('File already exists');
                return res.json({
                    thumbnailUrl,
                    file: `${hostUrl}${formattedFilename}`,
                    name,
                    upload_date: uploadDate,
                    duration,
                });
            }

            // If file doesn't exist, download and upload it
            const mp4Response = await axios.get(contentUrl, { responseType: 'stream' });
            const uploadStream = bucket.openUploadStream(formattedFilename);

            mp4Response.data.pipe(uploadStream).on('error', (error) => {
                console.error('Error uploading file: ', error);
                res.status(500).json({ error: 'Error uploading file' });
            }).on('finish', () => {
                console.log(`MP4 file downloaded and saved to: ${formattedFilename}`);

                // Send the response with details
                res.json({
                    thumbnailUrl,
                    file: `${hostUrl}${formattedFilename}`,
                    name,
                    upload_date: uploadDate,
                    duration,
                });
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

//Upload
app.post('/upload', async (req, res) => {
    const dtbclient = await connectToDatabase();
    const dtb = dtbclient.dtb;
    const bucket = new GridFSBucket(dtb, {
      bucketName: 'uploads'
    });
  
    const videoStream = fs.createReadStream(req.file.path);
    const uploadStream = bucket.openUploadStream(req.file.originalname);
  
    videoStream.pipe(uploadStream).on('error', (error) => {
      console.error('Error uploading file: ', error);
      res.status(500).json({ error: 'Error uploading file' });
    }).on('finish', () => {
      console.log('File upload successful');
      res.json({ file: req.file });
    });
  });

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


app.get('/:filename', async (req, res) => {
    const dtbclient = await connectToDatabase();
    const gfs = dtbclient.gfs;
    if (!gfs) {
        return res.status(500).send({ error: 'Server error' });
    }

    const downloadStream = gfs.openDownloadStreamByName(req.params.filename);

    downloadStream.on('data', (chunk) => {
      res.write(chunk);
    });

    downloadStream.on('error', () => {
      res.sendStatus(404);
    });

    downloadStream.on('end', () => {
      res.end();
    });

    // Set the Content-Type header
    res.set('Content-Type', 'video/mp4');
});

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
