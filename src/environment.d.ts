declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NEXT_PUBLIC_LULL_API_BASE_URL: string
    }
  }
}

export {}
