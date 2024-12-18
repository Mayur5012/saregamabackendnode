const mongoose = require('mongoose');

const SongSchema = new mongoose.Schema({
    name: { type: String, required: true },
    url: { type: String, required: true },
    original_filename: { type: String, required: true }
});

module.exports = mongoose.model('Song', SongSchema);