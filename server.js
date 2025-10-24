const http = require('http');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { getFilesFromBucket, saveFilesToJson, minioClient, getConfiguredBucket, uploadFileToMinIO, isSupportedFileType } = require('./minio-video-viewer.js');

const PORT = 3000;

// Cấu hình multer cho upload
const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 500 * 1024 * 1024 // Giới hạn 500MB
    },
    fileFilter: (req, file, cb) => {
        // Kiểm tra file type có được hỗ trợ không
        if (isSupportedFileType(file.originalname)) {
            cb(null, true);
        } else {
            cb(new Error('Chỉ hỗ trợ file video và hình ảnh'), false);
        }
    }
});

// MIME types
const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.mp4': 'video/mp4',
    '.avi': 'video/x-msvideo',
    '.mov': 'video/quicktime',
    '.mkv': 'video/x-matroska',
    '.wmv': 'video/x-ms-wmv',
    '.flv': 'video/x-flv',
    '.webm': 'video/webm',
    '.m4v': 'video/x-m4v'
};

// Hàm serve file tĩnh
function serveStaticFile(res, filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    
    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/html' });
            res.end('<h1>404 - File Not Found</h1>');
            return;
        }
        
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
    });
}

// Hàm cập nhật dữ liệu từ MinIO
async function updateMediaData() {
    try {
        console.log('🔄 Đang cập nhật dữ liệu từ MinIO...');
        const bucket = getConfiguredBucket();
        const files = await getFilesFromBucket(bucket);
        console.log('✅ Cập nhật dữ liệu thành công');
        return files;
    } catch (error) {
        console.error('❌ Lỗi cập nhật dữ liệu từ MinIO:', {
            message: error?.message,
            code: error?.code
        });
        return null;
    }
}

// Tạo server
const server = http.createServer(async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    const url = req.url;
    
    console.log(`${new Date().toISOString()} - ${req.method} ${url}`);
    
    // Debug log cho media requests
    if (url.startsWith('/media/')) {
        console.log(`🎬 Media request: ${url}`);
    }
    
    // Route chính
    if (url === '/' || url === '/index.html') {
        serveStaticFile(res, path.join(__dirname, 'minio-viewer.html'));
        return;
    }
    
    // API endpoint để lấy dữ liệu
    if (url.startsWith('/api/media')) {
        try {
            console.log('🔄 API /api/media được gọi - đang cập nhật dữ liệu từ MinIO...');
            // Luôn cập nhật dữ liệu mới từ MinIO
            const files = await updateMediaData();
            if (files) {
                console.log(`✅ Trả về ${files.length} file từ MinIO`);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    timestamp: new Date().toISOString(),
                    totalFiles: files.length,
                    videos: files.filter(f => f.type === 'video'),
                    images: files.filter(f => f.type === 'image'),
                    allFiles: files
                }));
            } else {
                console.log('❌ Không thể lấy dữ liệu từ MinIO');
                res.writeHead(502, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'MinIO không phản hồi hoặc cấu hình không hợp lệ' }));
            }
        } catch (error) {
            console.error('❌ Lỗi API /api/media:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: error.message }));
        }
        return;
    }
    
    
    // API endpoint để cập nhật dữ liệu
    if (url === '/api/refresh') {
        try {
            const files = await updateMediaData();
            if (files) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                    success: true, 
                    message: 'Dữ liệu đã được cập nhật',
                    totalFiles: files.length 
                }));
            } else {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Không thể cập nhật dữ liệu' }));
            }
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: error.message }));
        }
        return;
    }
    
    // API endpoint để upload file
    if (url === '/api/upload') {
        if (req.method !== 'POST') {
            res.writeHead(405, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Method not allowed' }));
            return;
        }
        
        try {
            // Sử dụng multer để xử lý upload
            upload.single('file')(req, res, async (err) => {
                if (err) {
                    console.error('❌ Lỗi upload:', err.message);
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ 
                        success: false, 
                        error: err.message 
                    }));
                    return;
                }
                
                if (!req.file) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ 
                        success: false, 
                        error: 'Không có file được chọn' 
                    }));
                    return;
                }
                
                try {
                    const bucket = getConfiguredBucket();
                    const fileName = req.file.originalname;
                    const fileBuffer = req.file.buffer;
                    
                    console.log(`📤 Upload file: ${fileName} (${req.file.size} bytes)`);
                    
                    // Upload file lên MinIO
                    const result = await uploadFileToMinIO(fileBuffer, fileName, bucket);
                    
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        success: true,
                        message: 'Upload thành công',
                        fileName: result.fileName,
                        etag: result.etag,
                        size: req.file.size
                    }));
                    
                } catch (uploadError) {
                    console.error('❌ Lỗi upload lên MinIO:', uploadError);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ 
                        success: false, 
                        error: 'Lỗi upload lên MinIO: ' + uploadError.message 
                    }));
                }
            });
            
        } catch (error) {
            console.error('❌ Lỗi xử lý upload:', error);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ 
                success: false, 
                error: error.message 
            }));
        }
        return;
    }
    
    // Proxy file từ MinIO
    if (url.startsWith('/media/')) {
        try {
            const fileName = decodeURIComponent(url.substring(7)); // Bỏ '/media/' prefix
            console.log(`📁 Đang tải file: ${fileName}`);
            
            // Lấy file từ MinIO
            const bucket = getConfiguredBucket();
            const stream = await minioClient.getObject(bucket, fileName);
            
            // Xác định content type
            const ext = path.extname(fileName).toLowerCase();
            const contentType = mimeTypes[ext] || 'application/octet-stream';
            
            // Set headers
            res.writeHead(200, {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=3600',
                'Access-Control-Allow-Origin': '*'
            });
            
            // Stream file về client
            stream.pipe(res);
            
            stream.on('error', (err) => {
                console.error('❌ Lỗi stream file:', err);
                if (!res.headersSent) {
                    res.writeHead(404, { 'Content-Type': 'text/plain' });
                    res.end('File not found');
                }
            });
            
        } catch (error) {
            console.error('❌ Lỗi tải file từ MinIO:', error);
            if (!res.headersSent) {
                const status = error?.code === 'NoSuchKey' ? 404 : 502;
                res.writeHead(status, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: error?.message || 'Không thể tải file từ MinIO', code: error?.code }));
            }
        }
        return;
    }
    
    
    // 404 cho các route khác
    res.writeHead(404, { 'Content-Type': 'text/html' });
    res.end(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>404 - Not Found</title>
            <style>
                body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                h1 { color: #e74c3c; }
                a { color: #3498db; text-decoration: none; }
                a:hover { text-decoration: underline; }
            </style>
        </head>
        <body>
            <h1>404 - Trang không tìm thấy</h1>
            <p>Trang bạn đang tìm kiếm không tồn tại.</p>
            <a href="/">← Quay về trang chủ</a>
        </body>
        </html>
    `);
});

// Khởi động server
server.listen(PORT, () => {
    console.log('🚀 MinIO Media Server đã khởi động!');
    console.log(`🌐 Truy cập: http://localhost:${PORT}`);
    console.log(`📊 API: http://localhost:${PORT}/api/media`);
    console.log(`🔄 Refresh: http://localhost:${PORT}/api/refresh`);
    console.log('');
    
    // Cập nhật dữ liệu lần đầu
    updateMediaData();
    
    // Tự động cập nhật mỗi 5 phút
    setInterval(updateMediaData, 5 * 60 * 1000);
});

// Xử lý tắt server
process.on('SIGINT', () => {
    console.log('\n👋 Đang tắt server...');
    server.close(() => {
        console.log('✅ Server đã được tắt');
        process.exit(0);
    });
});

module.exports = server;
