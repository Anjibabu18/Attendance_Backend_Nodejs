import { v2 as cloudinary } from 'cloudinary';

// Configure based on env variables (CLOUDINARY_URL or specific keys)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

export interface UploadResult {
  url: string;
  publicId: string;
}

const isConfigured = () => {
  return !!process.env.CLOUDINARY_CLOUD_NAME && !!process.env.CLOUDINARY_API_KEY && !!process.env.CLOUDINARY_API_SECRET;
};

// Helper for buffer upload since cloudinary upload() expects a file path by default
const uploadBuffer = (buffer: Buffer, folder: string, publicId: string): Promise<UploadResult> => {
  return new Promise((resolve, reject) => {
    if (!isConfigured()) {
      return resolve({
        url: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
        publicId,
      });
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        overwrite: true,
        resource_type: 'auto',
      },
      (error, result) => {
        if (error || !result) {
          reject(error || new Error('Upload failed'));
        } else {
          resolve({
            url: result.secure_url,
            publicId: result.public_id,
          });
        }
      }
    );

    uploadStream.end(buffer);
  });
};

export const uploadGroupPhoto = (buffer: Buffer, publicId: string) => {
  return uploadBuffer(buffer, 'attendance/company-roles', publicId);
};

export const uploadDailyGroupPhoto = (buffer: Buffer, publicId: string) => {
  return uploadBuffer(buffer, 'attendance/daily-group-photos', publicId);
};

export const uploadAttendancePhoto = (buffer: Buffer, publicId: string) => {
  return uploadBuffer(buffer, 'attendance/attendance-punches', publicId);
};

export const uploadDocument = (buffer: Buffer, publicId: string) => {
  return uploadBuffer(buffer, 'attendance/request-documents', publicId);
};
