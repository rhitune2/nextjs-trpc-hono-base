'use client'
import { trpc } from '@/utils/trpc'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Upload, Database, Shield, Zap } from 'lucide-react'

export default function Home() {
  const hello = trpc.hello.useQuery();

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-4">Next.js + tRPC + Hono Base</h1>
        <p className="text-xl text-muted-foreground mb-2">{hello?.data?.greeting}</p>
        <p className="text-muted-foreground">Production-ready fullstack boilerplate with MinIO, Redis, and more</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <Upload className="h-8 w-8 mb-2 text-primary" />
            <CardTitle>File Upload</CardTitle>
          </CardHeader>
          <CardContent>
            <CardDescription>
              MinIO-powered file storage with drag-and-drop interface
            </CardDescription>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Database className="h-8 w-8 mb-2 text-primary" />
            <CardTitle>Redis Cache</CardTitle>
          </CardHeader>
          <CardContent>
            <CardDescription>
              Self-hosted Redis for caching and session management
            </CardDescription>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Shield className="h-8 w-8 mb-2 text-primary" />
            <CardTitle>Rate Limiting</CardTitle>
          </CardHeader>
          <CardContent>
            <CardDescription>
              Built-in rate limiting with Redis-backed storage
            </CardDescription>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Zap className="h-8 w-8 mb-2 text-primary" />
            <CardTitle>Type Safety</CardTitle>
          </CardHeader>
          <CardContent>
            <CardDescription>
              End-to-end type safety with tRPC and TypeScript
            </CardDescription>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-center gap-4 pt-8">
        <Link href="/upload">
          <Button size="lg">
            <Upload className="mr-2 h-4 w-4" />
            Try File Upload
          </Button>
        </Link>
        <Link href="/logs">
          <Button size="lg" variant="outline">
            <Database className="mr-2 h-4 w-4" />
            View System Logs
          </Button>
        </Link>
      </div>
    </div>
  )
}
