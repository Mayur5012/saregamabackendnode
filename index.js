require('dotenv').config();
const express = require('express');
const AWS = require('aws-sdk');
const multer = require('multer');
const mongoose = require('mongoose');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');

// Initialize Express app
const app = express();

// CORS Configuration
const corsOptions = {
    origin: [
        'https://saregama.onrender.com',  
        'http://saregama.onrender.com',   
        'http://localhost:3000',         
        'https://localhost:3000'          
    ],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Allowed file extensions
const ALLOWED_EXTENSIONS = ['mp3', 'wav', 'ogg'];

// Validate file extension
const allowedFile = (filename) => {
    const ext = filename.split('.').pop().toLowerCase();
    return ALLOWED_EXTENSIONS.includes(ext);
};

// Load environment variables with validation
const validateEnvVariables = () => {
    const requiredVars = [
        'AWS_ACCESS_KEY_ID', 
        'AWS_SECRET_ACCESS_KEY', 
        'AWS_S3_BUCKET_NAME', 
        'MONGODB_CONNECTION_URL'
    ];

    for (const varName of requiredVars) {
        if (!process.env[varName]) {
            throw new Error(`Missing critical environment variable: ${varName}`);
        }
    }
};

// MongoDB Connection
const connectMongoDB = async () => {
    try {
        validateEnvVariables();
        await mongoose.connect(process.env.MONGODB_CONNECTION_URL);
        console.log('Connected to MongoDB');
    } catch (err) {
        console.error('Initialization error:', err);
        process.exit(1);
    }
};

// Configure AWS S3
const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || 'us-east-1'
});

// Configure Multer for file handling
const upload = multer({
    storage: multer.memoryStorage(),
    fileFilter: (req, file, cb) => {
        if (allowedFile(file.originalname)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type'), false);
        }
    }
});

// MongoDB Song Schema
const SongSchema = new mongoose.Schema({
    name: { type: String, required: true },
    url: { type: String, required: true },
    original_filename: { type: String, required: true }
});
const Song = mongoose.model('Song', SongSchema);

// Upload to S3
const uploadToS3 = async (file) => {
    // Generate a unique filename
    const uniqueFilename = `${crypto.randomBytes(16).toString('hex')}_${file.originalname}`;
    
    const params = {
        Bucket: process.env.AWS_S3_BUCKET_NAME,
        Key: uniqueFilename,
        Body: file.buffer,
        ContentType: file.mimetype,
        ACL: 'public-read'
    };

    try {
        const data = await s3.upload(params).promise();
        return {
            url: data.Location,
            filename: uniqueFilename
        };
    } catch (error) {
        console.error('S3 upload error:', error);
        throw error;
    }
};

// GET all songs
app.get('/songs', async (req, res) => {
    try {
        const songs = await Song.find({});
        res.json(songs);
    } catch (error) {
        res.status(500).json({ error: `Failed to fetch songs: ${error.message}` });
    }
});

// Upload song endpoint
app.post('/upload', upload.single('file'), async (req, res) => {
    try {
        // Check if file exists
        if (!req.file) {
            return res.status(400).json({ error: 'No file part' });
        }

        // Upload to S3
        const { url, filename } = await uploadToS3(req.file);

        // Save metadata to MongoDB
        const songData = {
            name: req.body.name || filename,
            url: url,
            original_filename: req.file.originalname
        };

        const song = new Song(songData);
        await song.save();

        res.status(201).json({
            message: 'Song uploaded successfully!', 
            song_id: song._id
        });
    } catch (error) {
        console.error('Upload failed:', error);
        res.status(500).json({ error: `Upload failed: ${error.message}` });
    }
});

// Health check route
app.get('/', (req, res) => {
    res.status(200).json({ status: 'healthy' });
});

// Connect to MongoDB and start server
const startServer = async () => {
    try {
        await connectMongoDB();
        const PORT = process.env.PORT || 5000;
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`Server running on http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
    }
};

startServer();

module.exports = app;

// require('dotenv').config();
// const express = require('express');
// const mongoose = require('mongoose');
// const bodyParser = require('body-parser');
// const cors = require('cors');
// const multer = require('multer');
// const path = require('path');
// const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
// const Song = require('./models/Song');

// const app = express();
// const upload = multer();

// // Initialize AWS Lambda client
// const lambdaClient = new LambdaClient({
//     region: process.env.AWS_REGION,
//     credentials: {
//         accessKeyId: process.env.AWS_ACCESS_KEY_ID,
//         secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
//     },
// });
// // Middleware
// app.use(cors());
// app.use(bodyParser.json());

// // MongoDB Connection
// mongoose.connect(process.env.MONGODB_CONNECTION_URL)
//     .then(() => console.log('Connected to MongoDB'))
//     .catch((err) => console.error('MongoDB connection error:', err));

// // Upload Song
// app.post('/upload', upload.single('file'), async (req, res) => {
//     try {
//         // Save the song in MongoDB
//         const song = new Song({
//             name: req.body.name,
//             file: req.file.buffer,
//             fileType: req.file.mimetype,
//         });
//         await song.save();

//         // Define Lambda payload
//         const payload = {
//             name: req.body.name,
//             file: `https://saregamamusicbucket.s3.amazonaws.com/${req.body.name}`,
//         };

//         const params = {
//             FunctionName: 'saregamasongs',
//             Payload: Buffer.from(JSON.stringify(payload)),
//         };

//         // Invoke Lambda
//         try {
//             const command = new InvokeCommand(params);
//             const data = await lambdaClient.send(command);
//             console.log('Lambda response:', data);
//         } catch (err) {
//             console.error('Error invoking Lambda:', err);
//             return res.status(500).send('Error invoking Lambda');
//         }

//         res.status(200).send('Song uploaded successfully');
//     } catch (err) {
//         res.status(500).send(err.message);
//     }
// });

// // Get All Songs
// app.get('/songs', async (req, res) => {
//     try {
//         const songs = await Song.find({}, 'name _id');
//         res.json(songs);
//     } catch (err) {
//         res.status(500).send(err.message);
//     }
// });

// // Stream Song
// app.get('/songs/:id', async (req, res) => {
//     try {
//         const song = await Song.findById(req.params.id);
//         if (!song) return res.status(404).send('Song not found');

//         res.set('Content-Type', song.fileType);
//         res.send(song.file);
//     } catch (err) {
//         res.status(500).send(err.message);
//     }
// });

// // Serve React Frontend
// app.use(express.static(path.resolve(__dirname, 'build')));
// app.get('*', (req, res) => {
//     res.sendFile(path.resolve(__dirname, 'build', 'index.html'));
// });

// // Start Server
// app.listen(5000, () => console.log('Server running on http://localhost:5000'));

