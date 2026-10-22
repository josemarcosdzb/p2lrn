import { ZipArchive } from '../core/zip.js';
import { documentZipLimits, readArchiveText } from './limits.js';
import { decodeXml, mediaTypeForAsset, normalizeZipRelative, readerId, xmlAttributes } from './utils.js';
function slideNumber(path) { return Number(path.match(/slide(\d+)\.xml$/i)?.[1] ?? 0); }
function relMap(archive, slidePath, limits) {
    const out = new Map();
    const file = slidePath.split('/').at(-1);
    const relPath = `ppt/slides/_rels/${file}.rels`;
    if (!archive.entries.has(relPath))
        return out;
    const xml = readArchiveText(archive, relPath, limits, 'PPTX slide relationships');
    for (const match of xml.matchAll(/<Relationship\b[^>]*\/>/gi)) {
        const attrs = xmlAttributes(match[0]);
        if (attrs.id && attrs.target && !/^[a-z]+:/i.test(attrs.target)) {
            out.set(attrs.id, normalizeZipRelative(slidePath, attrs.target));
        }
    }
    return out;
}
function shapeText(xml) {
    return [...xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/gi)]
        .map(match => decodeXml(match[1] ?? '').replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .join(' ')
        .trim();
}
function imageIds(xml) {
    return [...xml.matchAll(/<a:blip\b[^>]*\br:embed=["']([^"']+)["'][^>]*\/?\s*>/gi)]
        .map(match => match[1])
        .filter(Boolean);
}
function tableFromXml(xml, slide, index) {
    const rows = (xml.match(/<a:tr\b[\s\S]*?<\/a:tr>/gi) ?? [])
        .map(row => (row.match(/<a:tc\b[\s\S]*?<\/a:tc>/gi) ?? []).map(cell => shapeText(cell)))
        .filter(row => row.some(Boolean));
    if (!rows.length)
        return null;
    const columns = rows[0].map((value, i) => value || `column_${i + 1}`);
    const data = rows.slice(1).map(row => Object.fromEntries(columns.map((col, i) => [col, row[i] ?? ''])));
    return {
        id: readerId('pptx_table'), order: index + 1, sheet: `Slide ${slide}`,
        name: `Table ${index + 1} - slide ${slide}`, columns,
        rows: data.length ? data : [Object.fromEntries(columns.map(col => [col, '']))],
    };
}
export function extractPptx(input, limits) {
    const archive = ZipArchive.open(input.data, documentZipLimits(limits));
    const slides = archive.names()
        .filter(name => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
        .sort((a, b) => slideNumber(a) - slideNumber(b));
    if (!slides.length)
        throw new Error('PPTX contains no readable slides.');
    if (slides.length > limits.maxSlides)
        throw new Error(`PPTX exceeds lightweight reader slide limit (${slides.length} > ${limits.maxSlides}).`);
    const blocks = [];
    const tables = [];
    for (const slidePath of slides) {
        const slide = slideNumber(slidePath);
        const sheet = `Slide ${slide}`;
        const xml = readArchiveText(archive, slidePath, limits, `PPTX ${slidePath}`);
        const rels = relMap(archive, slidePath, limits);
        const shapes = xml.match(/<p:(?:sp|pic|graphicFrame)\b[\s\S]*?<\/p:(?:sp|pic|graphicFrame)>/gi) ?? [];
        let textIndex = 0;
        for (const shape of shapes) {
            if (/^<p:graphicFrame\b/i.test(shape) && /<a:tbl\b/i.test(shape)) {
                const table = tableFromXml(shape, slide, tables.length);
                if (table) {
                    tables.push(table);
                    blocks.push({
                        id: readerId('pptx_table_block'), type: 'TABLE', text: table.name ?? 'Table',
                        order: blocks.length + 1, sheet, source: { type: 'PPTX', raw: { slide, tableId: table.id } },
                    });
                }
                continue;
            }
            const text = shapeText(shape);
            if (text) {
                blocks.push({
                    id: readerId(textIndex === 0 ? 'pptx_title' : 'pptx_text'),
                    type: textIndex === 0 ? 'TITLE' : 'PARAGRAPH',
                    text, order: blocks.length + 1, level: textIndex === 0 ? 2 : undefined, sheet,
                    source: { type: 'PPTX', raw: { slide, path: slidePath } },
                });
                textIndex++;
            }
            for (const id of imageIds(shape)) {
                const path = rels.get(id);
                if (!path)
                    continue;
                blocks.push({
                    id: readerId('pptx_image'), type: 'IMAGE_REFERENCE', text: path,
                    order: blocks.length + 1, sheet,
                    asset: { path, mediaType: mediaTypeForAsset(path), relationshipId: id },
                    source: { type: 'PPTX', raw: { slide, path: slidePath } },
                });
            }
        }
        // Fallback for unusual producers that place text outside normal shapes.
        if (!blocks.some(block => block.sheet === sheet)) {
            const text = shapeText(xml);
            if (text) {
                blocks.push({
                    id: readerId('pptx_text'), type: 'PARAGRAPH', text, order: blocks.length + 1, sheet,
                    source: { type: 'PPTX', raw: { slide, path: slidePath, fallback: true } },
                });
            }
        }
    }
    if (!blocks.length && !tables.length)
        throw new Error('PPTX contains no readable text, tables or referenced images.');
    return {
        version: 'p2lrn.document-reader.v1',
        source: { name: input.name, extension: 'pptx', mediaType: input.mediaType, detectedType: 'PPTX', strategy: 'PPTX_SLIDES_XML' },
        metadata: {
            detectedTitle: blocks.find(block => block.type === 'TITLE')?.text,
            sheets: slides.map(path => `Slide ${slideNumber(path)}`),
        },
        blocks, tables,
        warnings: [],
        raw: { referencedImageCount: blocks.filter(block => block.type === 'IMAGE_REFERENCE').length },
    };
}
//# sourceMappingURL=pptx.js.map