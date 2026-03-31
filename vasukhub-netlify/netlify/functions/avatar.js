const busboy = require('busboy');
const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers, body: '' };
    }

    // Проверяем авторизацию
    const authHeader = event.headers.authorization;
    if (!authHeader) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
    const token = authHeader.split(' ')[1];
    let userId;
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        userId = decoded.id;
    } catch (err) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: 'Method Not Allowed' };
    }

    // Парсим multipart/form-data
    const bb = busboy({ headers: event.headers });
    let avatarFile = null;

    await new Promise((resolve, reject) => {
        bb.on('file', (fieldname, file, filename, encoding, mimetype) => {
            const chunks = [];
            file.on('data', (data) => chunks.push(data));
            file.on('end', () => {
                const buffer = Buffer.concat(chunks);
                avatarFile = { buffer, filename, mimetype };
            });
        });
        bb.on('finish', () => resolve());
        bb.on('error', reject);
        bb.end(Buffer.from(event.body, 'base64'));
    });

    if (!avatarFile) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'No file uploaded' }) };
    }

    const ext = avatarFile.filename.split('.').pop();
    const uniqueName = `avatar-${userId}-${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(uniqueName, avatarFile.buffer, { contentType: avatarFile.mimetype });
    if (uploadError) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: uploadError.message }) };
    }
    const publicUrl = supabase.storage.from('avatars').getPublicUrl(uniqueName).data.publicUrl;

    // Обновляем запись пользователя
    const { error: updateError } = await supabase
        .from('users')
        .update({ avatar_url: publicUrl })
        .eq('id', userId);
    if (updateError) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: updateError.message }) };
    }

    return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, avatar_url: publicUrl }),
    };
};