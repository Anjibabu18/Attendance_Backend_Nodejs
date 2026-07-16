"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectFace = exports.verifyFace = void 0;
const jimp_1 = __importDefault(require("jimp"));
const HASH_SIZE = 16;
// Stricter threshold for exact match (Java was 0.50, which is too loose for perceptual hashing)
const VERIFIED_THRESHOLD = 0.85;
async function getAHash(buffer) {
    const image = await jimp_1.default.read(buffer);
    image.resize(HASH_SIZE, HASH_SIZE).grayscale();
    let sum = 0;
    const vals = [];
    for (let y = 0; y < HASH_SIZE; y++) {
        for (let x = 0; x < HASH_SIZE; x++) {
            const hex = image.getPixelColor(x, y);
            const { r } = jimp_1.default.intToRGBA(hex);
            vals.push(r);
            sum += r;
        }
    }
    const avg = sum / vals.length;
    let hash = '';
    for (const v of vals) {
        hash += v >= avg ? '1' : '0';
    }
    return hash;
}
function hammingDistance(hash1, hash2) {
    let distance = 0;
    for (let i = 0; i < hash1.length; i++) {
        if (hash1[i] !== hash2[i]) {
            distance++;
        }
    }
    return distance;
}
const verifyFace = async (profilePhotoUrl, punchPhotoBuffer) => {
    if (!profilePhotoUrl) {
        return { similarityScore: null, verified: false, message: 'Profile photo missing' };
    }
    const serviceEnabled = process.env.FACE_SERVICE_ENABLED === 'true';
    const serviceUrl = process.env.FACE_SERVICE_URL;
    if (serviceEnabled && serviceUrl) {
        try {
            const profileRes = await fetch(profilePhotoUrl);
            if (!profileRes.ok)
                throw new Error('Failed to fetch profile photo');
            const profileBuffer = Buffer.from(await profileRes.arrayBuffer());
            const formData = new FormData();
            formData.append('profile', new Blob([new Uint8Array(profileBuffer)], { type: 'image/jpeg' }), 'profile.jpg');
            formData.append('punch', new Blob([new Uint8Array(punchPhotoBuffer)], { type: 'image/jpeg' }), 'punch.jpg');
            const verifyRes = await fetch(`${serviceUrl}/verify`, {
                method: 'POST',
                body: formData,
            });
            if (!verifyRes.ok) {
                const errorData = await verifyRes.json().catch(() => ({}));
                return { similarityScore: null, verified: false, message: errorData.detail || 'Face service rejected the images' };
            }
            const data = await verifyRes.json();
            return {
                similarityScore: data.score,
                verified: data.verified,
                message: data.message || (data.verified ? 'Verified by AI' : 'Low similarity (Face mismatch)'),
            };
        }
        catch (e) {
            return { similarityScore: null, verified: false, message: 'Face service unavailable: ' + e.message };
        }
    }
    // Local fallback (aHash) if face service is disabled
    try {
        const profileRes = await fetch(profilePhotoUrl);
        if (!profileRes.ok)
            throw new Error('Failed to fetch profile photo');
        const profileBuffer = Buffer.from(await profileRes.arrayBuffer());
        const hash1 = await getAHash(profileBuffer);
        const hash2 = await getAHash(punchPhotoBuffer);
        const distance = hammingDistance(hash1, hash2);
        const totalBits = HASH_SIZE * HASH_SIZE;
        const similarity = Math.max(0, 1 - (distance / totalBits));
        const verified = similarity >= VERIFIED_THRESHOLD;
        return {
            similarityScore: similarity,
            verified,
            message: verified ? 'Verified (Local Exact Match)' : 'Low similarity (Face mismatch)'
        };
    }
    catch (error) {
        return { similarityScore: null, verified: false, message: 'Verification unavailable: ' + error.message };
    }
};
exports.verifyFace = verifyFace;
const detectFace = async (photoBuffer) => {
    if (!photoBuffer || photoBuffer.length === 0) {
        return { faceDetected: false, faceCount: 0, message: 'Photo is required', available: true };
    }
    const serviceEnabled = process.env.FACE_SERVICE_ENABLED === 'true';
    const serviceUrl = process.env.FACE_SERVICE_URL;
    if (serviceEnabled && serviceUrl) {
        try {
            const formData = new FormData();
            formData.append('image', new Blob([new Uint8Array(photoBuffer)], { type: 'image/jpeg' }), 'detect.jpg');
            const res = await fetch(`${serviceUrl}/detect`, {
                method: 'POST',
                body: formData,
            });
            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                return { faceDetected: false, faceCount: 0, message: errorData.detail || 'Face detection failed', available: true };
            }
            const data = await res.json();
            return {
                faceDetected: data.faceDetected,
                faceCount: data.faceCount,
                message: data.message,
                available: true,
            };
        }
        catch (e) {
            return { faceDetected: false, faceCount: 0, message: 'Face service unavailable: ' + e.message, available: false };
        }
    }
    // Local fallback
    try {
        // Just verify it's a readable image
        await jimp_1.default.read(photoBuffer);
        return { faceDetected: true, faceCount: 1, message: 'Image accepted; face service disabled', available: true };
    }
    catch (e) {
        return { faceDetected: false, faceCount: 0, message: 'Unreadable image', available: true };
    }
};
exports.detectFace = detectFace;
