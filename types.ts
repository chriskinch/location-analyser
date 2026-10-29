// Google Takeout / Timeline export, semantic segments format. Only the fields the app reads are typed.
export interface TimelineData {
    semanticSegments?: SemanticSegment[];
}

export interface SemanticSegment {
    startTime: string;
    endTime: string;
    visit?: {
        topCandidate?: {
            placeId?: string;
            semanticType?: string;
        };
    };
}

// GET /analyze success response.
export interface AnalysisResult {
    placeId: string;
    startDate: string;
    endDate: string;
    totalUniqueVisitDays: number;
    totalEligibleWorkingDays: number;
    averageVisitsPerWorkingWeek: number;
    visitedDates: string[];
    eligibleWorkingDates: string[];
}

// Error body returned by /analyze and /upload-timeline.
export interface ErrorResponse {
    error: string;
}

// POST /upload-timeline success response.
export interface UploadResult {
    ok: true;
    segments: number;
}
