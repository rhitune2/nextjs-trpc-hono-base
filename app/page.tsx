'use client'
import { trpc } from '@/utils/trpc'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

export default function Home() {
  const hello = useQuery(trpc.privateData.queryOptions());

  return <div>{hello.data?.message}</div>
}
