"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyFace = void 0;
const VERIFIED_THRESHOLD = 0.50; // Maximum Euclidean distance for a match
// Computes Euclidean distance between two 128-float arrays
function euclideanDistance(desc1, desc2) {
    if (desc1.length !== desc2.length)
        return Infinity;
    let sum = 0;
    for (let i = 0; i < desc1.length; i++) {
        const diff = desc1[i] - desc2[i];
        sum += diff * diff;
    }
    return Math.sqrt(sum);
}
const verifyFace = async (registeredDescriptorJson, liveDescriptor) => {
    if (!registeredDescriptorJson) {
        return { similarityScore: null, verified: false, message: 'No registered face found' };
    }
    try {
        const registeredDescriptor = JSON.parse(registeredDescriptorJson);
        if (!Array.isArray(registeredDescriptor) || registeredDescriptor.length !== 128) {
            return { similarityScore: null, verified: false, message: 'Registered face data is corrupted' };
        }
        if (!Array.isArray(liveDescriptor) || liveDescriptor.length !== 128) {
            return { similarityScore: null, verified: false, message: 'Live face data is corrupted' };
        }
        const distance = euclideanDistance(registeredDescriptor, liveDescriptor);
        // Convert distance to a similarity score (1.0 = exact match, 0.0 = completely different)
        const similarity = Math.max(0, 1 - distance);
        const verified = distance <= VERIFIED_THRESHOLD;
        return {
            similarityScore: similarity,
            verified,
            message: verified ? 'Verified by Browser ML' : 'Face mismatch (Too far from registered face)'
        };
    }
    catch (error) {
        return { similarityScore: null, verified: false, message: 'Verification unavailable: ' + error.message };
    }
};
exports.verifyFace = verifyFace;
