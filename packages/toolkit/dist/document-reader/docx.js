import { ZipArchive } from '../core/zip.js';
import { documentZipLimits, readArchiveText } from './limits.js';
import { mediaTypeForAsset, normalizeZipRelative, readerId, xmlAttributes, xmlText } from './utils.js';
function relMap(archive, limits) {
    const out = new Map();
    const name = 'word/_rels/document.xml.rels';
    if (!archive.entries.has(name))
        return out;
    const xml = readArchiveText(archive, name, limits, 'DOCX relationships');
    for (const match of xml.matchAll(/<Relationship\b[^>]*\/>/gi)) {
        const attrs = xmlAttributes(match[0]);
        const id = attrs.id;
        const target = attrs.target;
        if (id && target && !/^[a-z]+:/i.test(target)) {
            out.set(id, normalizeZipRelative('word/document.xml', target));
        }
    }
    return out;
}
function paragraphStyle(xml) {
    const style = xml.match(/<w:pStyle[^>]+w:val=["']([^"']+)["']/i)?.[1] ?? '';
    const heading = style.match(/heading\s*([1-6])/i) ?? style.match(/t[ií]tulo\s*([1-6])/i);
    const level = heading ? Number(heading[1]) : undefined;
    return {
        level,
        style,
        list: /<w:numPr\b/i.test(xml),
        bold: /<w:b(?:\s|\/|>)/i.test(xml),
    };
}
function imageIds(xml) {
    const ids = [];
    for (const match of xml.matchAll(/<a:blip\b[^>]*\br:embed=["']([^"']+)["'][^>]*\/?\s*>/gi)) {
        if (match[1])
            ids.push(match[1]);
    }
    for (const match of xml.matchAll(/<v:imagedata\b[^>]*\br:id=["']([^"']+)["'][^>]*\/?\s*>/gi)) {
        if (match[1])
            ids.push(match[1]);
    }
    return ids;
}
function paragraphBlocks(xml, paragraphIndex, rels, input, startOrder) {
    const style = paragraphStyle(xml);
    const result = [];
    let order = startOrder;
    let buffered = '';
    const flush = () => {
        const text = xmlText(buffered);
        buffered = '';
        if (!text)
            return;
        result.push({
            id: readerId(style.level ? 'docx_title' : style.list ? 'docx_list' : 'docx_paragraph'),
            type: style.level ? 'TITLE' : style.list ? 'LIST' : 'PARAGRAPH',
            text,
            order: order++,
            level: style.level,
            style: { bold: style.bold },
            source: { type: 'DOCX', raw: { paragraphIndex, paragraphStyle: style.style } },
        });
    };
    const tokens = xml.match(/<w:r\b[\s\S]*?<\/w:r>|<w:hyperlink\b[\s\S]*?<\/w:hyperlink>/gi) ?? [];
    if (tokens.length === 0) {
        buffered = xml;
        flush();
        for (const id of imageIds(xml)) {
            const path = rels.get(id);
            if (!path)
                continue;
            result.push({
                id: readerId('docx_image'), type: 'IMAGE_REFERENCE', text: path, order: order++,
                asset: { path, mediaType: mediaTypeForAsset(path), relationshipId: id },
                source: { type: 'DOCX', raw: { paragraphIndex } },
            });
        }
        return result;
    }
    for (const token of tokens) {
        const ids = imageIds(token);
        if (ids.length) {
            const textBefore = token.replace(/<a:blip\b[\s\S]*?>/gi, ' ');
            buffered += ' ' + textBefore;
            flush();
            for (const id of ids) {
                const path = rels.get(id);
                if (!path)
                    continue;
                result.push({
                    id: readerId('docx_image'), type: 'IMAGE_REFERENCE', text: path, order: order++,
                    asset: { path, mediaType: mediaTypeForAsset(path), relationshipId: id },
                    source: { type: 'DOCX', raw: { paragraphIndex } },
                });
            }
        }
        else {
            buffered += ' ' + token;
        }
    }
    flush();
    return result;
}
function tableFromXml(xml, index) {
    const rows = (xml.match(/<w:tr\b[\s\S]*?<\/w:tr>/gi) ?? [])
        .map(row => (row.match(/<w:tc\b[\s\S]*?<\/w:tc>/gi) ?? []).map(cell => xmlText(cell)))
        .filter(row => row.some(Boolean));
    if (!rows.length)
        return null;
    const columns = rows[0].map((value, i) => value || `column_${i + 1}`);
    const data = rows.slice(1).map(row => Object.fromEntries(columns.map((col, i) => [col, row[i] ?? ''])));
    return {
        id: readerId('docx_table'),
        order: index + 1,
        name: `Table ${index + 1}`,
        columns,
        rows: data.length ? data : [Object.fromEntries(columns.map(col => [col, '']))],
    };
}
export function extractDocx(input, limits) {
    const archive = ZipArchive.open(input.data, documentZipLimits(limits));
    const documentPath = 'word/document.xml';
    if (!archive.entries.has(documentPath))
        throw new Error('DOCX does not contain word/document.xml.');
    const xml = readArchiveText(archive, documentPath, limits, 'DOCX document.xml');
    const rels = relMap(archive, limits);
    const body = xml.match(/<w:body\b[\s\S]*?<\/w:body>/i)?.[0] ?? xml;
    const top = body.match(/<w:p\b[\s\S]*?<\/w:p>|<w:tbl\b[\s\S]*?<\/w:tbl>/gi) ?? [];
    const blocks = [];
    const tables = [];
    let paragraphIndex = 0;
    for (const item of top) {
        if (/^<w:tbl\b/i.test(item)) {
            const table = tableFromXml(item, tables.length);
            if (table) {
                tables.push(table);
                blocks.push({
                    id: readerId('docx_table_block'), type: 'TABLE', text: table.name ?? 'Table', order: blocks.length + 1,
                    source: { type: 'DOCX', raw: { tableId: table.id } },
                });
            }
            continue;
        }
        const produced = paragraphBlocks(item, paragraphIndex++, rels, input, blocks.length + 1);
        for (const block of produced) {
            block.order = blocks.length + 1;
            blocks.push(block);
        }
    }
    if (!blocks.length && !tables.length)
        throw new Error('DOCX contains no readable text, tables or referenced images.');
    const title = blocks.find(block => block.type === 'TITLE')?.text
        ?? blocks.find(block => block.type === 'PARAGRAPH' && block.text.length <= 120)?.text;
    return {
        version: 'p2lrn.document-reader.v1',
        source: {
            name: input.name,
            extension: 'docx',
            mediaType: input.mediaType,
            detectedType: 'DOCX',
            strategy: 'DOCX_XML',
        },
        metadata: { detectedTitle: title },
        blocks,
        tables,
        warnings: [],
        raw: { referencedImageCount: blocks.filter(block => block.type === 'IMAGE_REFERENCE').length },
    };
}
//# sourceMappingURL=docx.js.map