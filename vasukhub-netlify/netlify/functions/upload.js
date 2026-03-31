const busboy = require('busboy');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: 'Method Not Allowed' };
    }

    // Парсим multipart/form-data
    const bb = busboy({ headers: event.headers });
    const files = [];

    await new Promise((resolve, reject) => {
        bb.on('file', (fieldname, file, filename, encoding, mimetype) => {
            const chunks = [];
            file.on('data', (data) => chunks.push(data));
            file.on('end', async () => {
                const buffer = Buffer.concat(chunks);
                const ext = filename.split('.').pop();
                const uniqueName = `${Date.now()}-${Math.random().toString(36).substr(2, 8)}.${ext}`;
                // Загружаем в Storage
                const { error: uploadError } = await supabase.storage
                    .from('uploads')
                    .upload(uniqueName, buffer, { contentType: mimetype });
                if (uploadError) {
                    reject(uploadError);
                    return;
                }
                const publicUrl = supabase.storage.from('uploads').getPublicUrl(uniqueName).data.publicUrl;
                files.push({
                    id: uniqueName,
                    filename: uniqueName,
                    originalName: filename,
                    type: mimetype,
                    size: buffer.length,
                    uploadedAt: new Date().toISOString(),
                    url: publicUrl,
                });
            });
        });
        bb.on('finish', () => resolve());
        bb.on('error', reject);
        bb.end(Buffer.from(event.body, 'base64'));
    });

    // Сохраняем метаданные в таблицу gallery
    const saved = [];
    for (const file of files) {
        const { data, error } = await supabase
            .from('gallery')
            .insert({
                id: file.id,
                filename: file.filename,
                original_name: file.originalName,
                type: file.type,
                size: file.size,
                uploaded_at: file.uploadedAt,
            })
            .select()
            .single();
        if (!error) saved.push(data);
    }

    return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, uploaded: saved }),
    };
};