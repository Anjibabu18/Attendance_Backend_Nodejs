"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadDocument = exports.uploadAttendancePhoto = exports.uploadDailyGroupPhoto = exports.uploadGroupPhoto = void 0;
const cloudinary_1 = require("cloudinary");
// Configure based on env variables (CLOUDINARY_URL or specific keys)
cloudinary_1.v2.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});
const isConfigured = () => {
    return !!process.env.CLOUDINARY_CLOUD_NAME && !!process.env.CLOUDINARY_API_KEY && !!process.env.CLOUDINARY_API_SECRET;
};
// Helper for buffer upload since cloudinary upload() expects a file path by default
const uploadBuffer = (buffer, folder, publicId) => {
    return new Promise((resolve, reject) => {
        if (!isConfigured()) {
            return resolve({
                url: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
                publicId,
            });
        }
        const uploadStream = cloudinary_1.v2.uploader.upload_stream({
            folder,
            public_id: publicId,
            overwrite: true,
            resource_type: 'auto',
        }, (error, result) => {
            if (error || !result) {
                reject(error || new Error('Upload failed'));
            }
            else {
                resolve({
                    url: result.secure_url,
                    publicId: result.public_id,
                });
            }
        });
        uploadStream.end(buffer);
    });
};
const uploadGroupPhoto = (buffer, publicId) => {
    return uploadBuffer(buffer, 'attendance/company-roles', publicId);
};
exports.uploadGroupPhoto = uploadGroupPhoto;
const uploadDailyGroupPhoto = (buffer, publicId) => {
    return uploadBuffer(buffer, 'attendance/daily-group-photos', publicId);
};
exports.uploadDailyGroupPhoto = uploadDailyGroupPhoto;
const uploadAttendancePhoto = (buffer, publicId) => {
    return uploadBuffer(buffer, 'attendance/attendance-punches', publicId);
};
exports.uploadAttendancePhoto = uploadAttendancePhoto;
const uploadDocument = (buffer, publicId) => {
    return uploadBuffer(buffer, 'attendance/request-documents', publicId);
};
exports.uploadDocument = uploadDocument;
