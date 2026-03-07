interface NotifyParams {
    tenant_id: string;
    type: string;
    title: string;
    message?: string;
    link?: string;
    roles?: string[];
    user_ids?: string[];
}
export declare function sendNotification(params: NotifyParams): Promise<void>;
export {};
//# sourceMappingURL=notificationService.d.ts.map