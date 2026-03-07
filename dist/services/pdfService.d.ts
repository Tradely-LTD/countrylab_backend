interface CoaData {
    result_id: string;
    tenant_id: string;
    qr_hash: string;
}
export declare function generateCoaPdf(data: CoaData): Promise<string>;
export {};
//# sourceMappingURL=pdfService.d.ts.map