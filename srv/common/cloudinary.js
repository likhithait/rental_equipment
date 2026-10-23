import { v2 as cloudinary } from 'cloudinary';
import crypto from 'node:crypto';

import fs from 'node:fs';
import path from 'node:path';

// Load .env file automatically if present
try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        content.split('\n').forEach(line => {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) {
                const eqIdx = trimmed.indexOf('=');
                if (eqIdx > 0) {
                    const key = trimmed.substring(0, eqIdx).trim();
                    const val = trimmed.substring(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
                    if (!process.env[key]) {
                        process.env[key] = val;
                    }
                }
            }
        });
    }
} catch (e) {
    // Ignore .env read error
}

// Cloud Foundry: credentials of a bound user-provided service (mta.yaml resource sprint-cloudinary)
try {
    const vcap = JSON.parse(process.env.VCAP_SERVICES || '{}');
    for (const instance of Object.values(vcap).flat()) {
        const url = instance?.credentials?.CLOUDINARY_URL;
        if (url && !process.env.CLOUDINARY_URL) process.env.CLOUDINARY_URL = url;
    }
} catch (e) {
    console.error('[Cloudinary] Could not read VCAP_SERVICES:', e.message);
}

// Extract and parse Cloudinary credentials
let cloudName = process.env.CLOUDINARY_CLOUD_NAME;
let apiKey = process.env.CLOUDINARY_API_KEY;
let apiSecret = process.env.CLOUDINARY_API_SECRET;

if (process.env.CLOUDINARY_URL) {
    try {
        const parsed = new URL(process.env.CLOUDINARY_URL);
        cloudName = cloudName || parsed.hostname;
        apiKey = apiKey || parsed.username;
        apiSecret = apiSecret || parsed.password;
    } catch (e) {
        console.error('[Cloudinary] Could not parse CLOUDINARY_URL:', e.message);
    }
}

const isConfigured = Boolean(cloudName && apiKey && apiSecret);

export const isCloudinaryConfigured = () => isConfigured;
export const cloudinaryCloudName = () => (isConfigured ? cloudName : null);

if (isConfigured) {
    cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
        secure: true
    });
    console.log(`[Cloudinary] Initialized with Cloudinary account: ${cloudName}`);
} else {
    console.log('[Cloudinary] Notice: Incomplete Cloudinary credentials. Fallback handler will store verifiable evidence hashes.');
}


/**
 * Compute cryptographic SHA-256 hash of image data (Buffer or Base64/DataURI).
 * Satisfies SAP Sprint FR-009 Photographic Evidence Tamper-Proof Requirement.
 */
export function computeSha256(input) {
    let buffer;
    let mimeType = 'image/jpeg';

    if (Buffer.isBuffer(input)) {
        buffer = input;
    } else if (typeof input === 'string') {
        if (input.startsWith('data:')) {
            const matches = input.match(/^data:([A-Za-z0-9.+/-]+);base64,(.+)$/s);
            if (matches && matches.length === 3) {
                mimeType = matches[1];
                buffer = Buffer.from(matches[2], 'base64');
            } else {
                buffer = Buffer.from(input, 'base64');
            }
        } else {
            buffer = Buffer.from(input, 'base64');
        }
    } else {
        throw new Error('Unsupported image input type for SHA-256 calculation');
    }

    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
    return { sha256, buffer, mimeType };
}

/**
 * Upload image to Cloudinary CDN and return secure media URL, public ID and SHA-256 hash.
 */
export async function uploadEvidencePhoto({
    imageBase64,
    fileName = 'evidence.jpg',
    folder = 'rental_damage_evidence',
    tags = ['sap_rental_sprint', 'damage_evidence']
}) {
    if (!imageBase64) {
        throw new Error('No image data provided for upload');
    }

    // 1. Calculate cryptographically secure SHA-256 integrity hash
    const { sha256, buffer, mimeType } = computeSha256(imageBase64);

    // Format Data URI for Cloudinary uploader
    const dataUri = imageBase64.startsWith('data:') 
        ? imageBase64 
        : `data:${mimeType};base64,${buffer.toString('base64')}`;

    // 2. Upload to Cloudinary when credentials are complete
    if (isConfigured) {
        try {
            const uploadResponse = await cloudinary.uploader.upload(dataUri, {
                folder,
                resource_type: 'image',
                tags,
                context: {
                    sha256,
                    original_filename: fileName
                }
            });

            console.log(`[Cloudinary] Successfully uploaded ${fileName} -> ${uploadResponse.secure_url} (SHA256: ${sha256.substring(0, 12)}...)`);

            return {
                mediaUrl: uploadResponse.secure_url,
                publicId: uploadResponse.public_id,
                sha256,
                format: uploadResponse.format,
                mimeType,
                isCloudinary: true
            };
        } catch (cloudErr) {
            console.error('[Cloudinary] Upload failed with provider, falling back to secure data URL:', cloudErr.message);
        }
    }

    // Fallback if Cloudinary credentials are not set or provider error occurs
    const mockPublicId = `evidence_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    return {
        mediaUrl: dataUri,
        publicId: mockPublicId,
        sha256,
        format: mimeType.split('/')[1] || 'jpeg',
        mimeType,
        isCloudinary: false
    };
}
