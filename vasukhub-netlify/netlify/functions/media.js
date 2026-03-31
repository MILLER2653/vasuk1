const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
    };
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers, body: '' };
    }

    // GET /api/media
    if (event.httpMethod === 'GET') {
        const { data, error } = await supabase
            .from('gallery')
            .select('*')
            .order('uploaded_at', { ascending: false });
        if (error) {
            return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
        }
        // Добавляем публичный URL для каждого файла
        const items = data.map(item => ({
            ...item,
            url: supabase.storage.from('uploads').getPublicUrl(item.filename).data.publicUrl,
        }));
        return { statusCode: 200, headers, body: JSON.stringify(items) };
    }

    // DELETE /api/media/:id (только админ по пин-коду)
    if (event.httpMethod === 'DELETE') {
        const id = event.path.split('/').pop();
        const pin = event.headers['x-pin'];
        if (pin !== '6666') {
            return { statusCode: 403, headers, body: JSON.stringify({ error: 'Неверный пин-код' }) };
        }
        // Удаляем из Storage
        const { data: media } = await supabase
            .from('gallery')
            .select('filename')
            .eq('id', id)
            .single();
        if (media) {
            await supabase.storage.from('uploads').remove([media.filename]);
        }
        // Удаляем запись из таблицы (каскадно удалятся лайки и комментарии)
        const { error } = await supabase.from('gallery').delete().eq('id', id);
        if (error) {
            return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
        }
        return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 404, headers, body: 'Not found' };
};