const Minio = require('minio');
const fs = require('fs');
const path = require('path');

// Đọc cấu hình từ minio-config.json (ưu tiên), fallback ENV
function loadMinioConfig() {
    const configPath = path.join(__dirname, 'minio-config.json');
    if (fs.existsSync(configPath)) {
        try {
            const raw = fs.readFileSync(configPath, 'utf8');
            const json = JSON.parse(raw);
            return {
                endPoint: json.endpoint || process.env.MINIO_ENDPOINT,
                port: typeof json.port === 'number' ? json.port : (process.env.MINIO_PORT ? Number(process.env.MINIO_PORT) : undefined),
                useSSL: typeof json.useSSL === 'boolean' ? json.useSSL : (process.env.MINIO_USE_SSL ? process.env.MINIO_USE_SSL === 'true' : undefined),
                accessKey: json.accessKey || process.env.MINIO_ACCESS_KEY,
                secretKey: json.secretKey || process.env.MINIO_SECRET_KEY,
                region: json.region || process.env.MINIO_REGION,
                bucket: json.bucket || process.env.MINIO_BUCKET
            };
        } catch (e) {
            // Không ném lỗi chung chung; ghi rõ ràng và fallback ENV
            console.error('Không thể đọc file cấu hình minio-config.json:', e.message);
        }
    }
    return {
        endPoint: process.env.MINIO_ENDPOINT,
        port: process.env.MINIO_PORT ? Number(process.env.MINIO_PORT) : undefined,
        useSSL: process.env.MINIO_USE_SSL ? process.env.MINIO_USE_SSL === 'true' : undefined,
        accessKey: process.env.MINIO_ACCESS_KEY,
        secretKey: process.env.MINIO_SECRET_KEY,
        region: process.env.MINIO_REGION,
        bucket: process.env.MINIO_BUCKET
    };
}

const loadedConfig = loadMinioConfig();
const minioClient = new Minio.Client({
    endPoint: loadedConfig.endPoint,
    port: loadedConfig.port ?? 443,
    useSSL: loadedConfig.useSSL ?? true,
    accessKey: loadedConfig.accessKey,
    secretKey: loadedConfig.secretKey,
    region: loadedConfig.region || 'us-east-1'
});

// Danh sách các định dạng file được hỗ trợ
const supportedVideoFormats = ['.mp4', '.avi', '.mov', '.mkv', '.wmv', '.flv', '.webm', '.m4v'];
const supportedImageFormats = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.tiff'];

// Hàm kiểm tra loại file
function getFileType(filename) {
    const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));
    
    if (supportedVideoFormats.includes(ext)) {
        return 'video';
    } else if (supportedImageFormats.includes(ext)) {
        return 'image';
    }
    return 'other';
}

// Hàm format kích thước file
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Hàm lấy danh sách file từ bucket
async function getFilesFromBucket(bucketName) {
    try {
        console.log(`🔍 Đang kết nối với MinIO server...`);
        console.log(`📁 Đang lấy danh sách file từ bucket: ${bucketName}`);
        
        const files = [];
        const stream = minioClient.listObjects(bucketName, '', true);
        
        return new Promise((resolve, reject) => {
            stream.on('data', (obj) => {
                const fileType = getFileType(obj.name);
                if (fileType === 'video' || fileType === 'image') {
                    files.push({
                        name: obj.name,
                        size: obj.size,
                        lastModified: obj.lastModified,
                        etag: obj.etag,
                        type: fileType,
                        sizeFormatted: formatFileSize(obj.size)
                    });
                }
            });
            
            stream.on('end', () => {
                console.log(`✅ Tìm thấy ${files.length} file media trong bucket`);
                resolve(files);
            });
            
            stream.on('error', (err) => {
                console.error('❌ Lỗi khi lấy danh sách file:', err);
                reject(err);
            });
        });
        
    } catch (error) {
        console.error('❌ Lỗi kết nối MinIO:', error);
        throw error;
    }
}

// Hàm hiển thị danh sách file
function displayFiles(files) {
    console.log('\n📋 DANH SÁCH FILE MEDIA:');
    console.log('='.repeat(80));
    
    const videos = files.filter(f => f.type === 'video');
    const images = files.filter(f => f.type === 'image');
    
    if (videos.length > 0) {
        console.log('\n🎬 VIDEO FILES:');
        console.log('-'.repeat(50));
        videos.forEach((file, index) => {
            console.log(`${index + 1}. ${file.name}`);
            console.log(`   📊 Kích thước: ${file.sizeFormatted}`);
            console.log(`   📅 Cập nhật: ${new Date(file.lastModified).toLocaleString('vi-VN')}`);
            console.log(`   🔗 URL: https://doc.hoclientuc.vn/${file.name}`);
            console.log('');
        });
    }
    
    if (images.length > 0) {
        console.log('\n🖼️  IMAGE FILES:');
        console.log('-'.repeat(50));
        images.forEach((file, index) => {
            console.log(`${index + 1}. ${file.name}`);
            console.log(`   📊 Kích thước: ${file.sizeFormatted}`);
            console.log(`   📅 Cập nhật: ${new Date(file.lastModified).toLocaleString('vi-VN')}`);
            console.log(`   🔗 URL: https://doc.hoclientuc.vn/${file.name}`);
            console.log('');
        });
    }
    
    console.log(`\n📊 TỔNG KẾT:`);
    console.log(`   🎬 Video: ${videos.length} file`);
    console.log(`   🖼️  Hình ảnh: ${images.length} file`);
    console.log(`   📁 Tổng cộng: ${files.length} file`);
}

// Hàm tạo URL truy cập file
function generateFileUrl(filename) {
    const protocol = (loadedConfig.useSSL ?? true) ? 'https' : 'http';
    const defaultPort = (loadedConfig.useSSL ?? true) ? 443 : 80;
    const portSegment = loadedConfig.port && loadedConfig.port !== defaultPort ? `:${loadedConfig.port}` : '';
    return `${protocol}://${loadedConfig.endPoint}${portSegment}/${filename}`;
}

// Hàm lưu danh sách file ra JSON
async function saveFilesToJson(files, filename = 'media-files.json') {
    const fs = require('fs');
    const data = {
        timestamp: new Date().toISOString(),
        totalFiles: files.length,
        videos: files.filter(f => f.type === 'video'),
        images: files.filter(f => f.type === 'image'),
        allFiles: files
    };
    
    fs.writeFileSync(filename, JSON.stringify(data, null, 2));
    console.log(`💾 Đã lưu danh sách file vào: ${filename}`);
}

// Hàm chính
async function main() {
    try {
        const bucketName = loadedConfig.bucket || 'videos';
        
        console.log('🚀 MINIO VIDEO VIEWER');
        console.log('='.repeat(50));
        console.log(`🌐 Server: ${loadedConfig.endPoint}`);
        console.log(`📁 Bucket: ${bucketName}`);
        // Không log accessKey/secretKey để tránh lộ thông tin nhạy cảm
        console.log('');
        
        // Kiểm tra bucket có tồn tại không
        const bucketExists = await minioClient.bucketExists(bucketName);
        if (!bucketExists) {
            console.error(`❌ Bucket '${bucketName}' không tồn tại!`);
            return;
        }
        
        // Lấy danh sách file
        const files = await getFilesFromBucket(bucketName);
        
        if (files.length === 0) {
            console.log('📭 Không tìm thấy file media nào trong bucket');
            return;
        }
        
        // Hiển thị danh sách
        displayFiles(files);
        
        // Lưu vào file JSON
        await saveFilesToJson(files);
        
        // Tạo danh sách URL
        console.log('\n🔗 DANH SÁCH URL TRUY CẬP:');
        console.log('='.repeat(50));
        files.forEach((file, index) => {
            console.log(`${index + 1}. ${file.name}`);
            console.log(`   URL: ${generateFileUrl(file.name)}`);
            console.log('');
        });
        
    } catch (error) {
        console.error('❌ Lỗi:', error.message);
        
        if (error.code === 'NetworkingError') {
            console.log('💡 Gợi ý: Kiểm tra kết nối mạng và URL server');
        } else if (error.code === 'InvalidAccessKeyId') {
            console.log('💡 Gợi ý: Kiểm tra Access Key và Secret Key');
        } else if (error.code === 'SignatureDoesNotMatch') {
            console.log('💡 Gợi ý: Kiểm tra Secret Key');
        }
    }
}

// Chạy chương trình
if (require.main === module) {
    main();
}

module.exports = {
    minioClient,
    getFilesFromBucket,
    displayFiles,
    generateFileUrl,
    saveFilesToJson,
    getConfiguredBucket: () => (loadedConfig.bucket || 'videos')
};