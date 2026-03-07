interface RequestConfirmationData {
    requestNumber: string;
    clientName: string;
    clientEmail: string;
    representativeName?: string;
    representativeEmail?: string;
    productName: string;
    testCategory: string;
}
export declare function sendRequestConfirmation(data: RequestConfirmationData): Promise<boolean>;
export declare function sendRequestApprovalEmail(data: {
    requestNumber: string;
    clientName: string;
    clientEmail: string;
    quotationAmount: number;
}): Promise<boolean>;
export {};
//# sourceMappingURL=emailService.d.ts.map