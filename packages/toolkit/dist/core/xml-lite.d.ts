export interface XmlNode {
    name: string;
    attributes: Record<string, string>;
    children: XmlNode[];
    text: string[];
    parent?: XmlNode;
}
export declare function parseXml(input: Uint8Array | string): XmlNode;
export declare function localName(name: string): string;
export declare function attrLocal(node: XmlNode, name: string): string | undefined;
export declare function descendants(node: XmlNode, includeSelf?: boolean): XmlNode[];
export declare function firstDescendant(node: XmlNode, name: string): XmlNode | undefined;
export declare function firstDirectChild(node: XmlNode | undefined, name: string): XmlNode | undefined;
export declare function textContent(node: XmlNode | undefined): string;
export declare function namespaceUri(node: XmlNode): string;
