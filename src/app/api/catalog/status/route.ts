import { NextResponse } from "next/server";
import { fetchCatalogStatusFromSupabase } from "@/lib/supabaseServer";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const status = await fetchCatalogStatusFromSupabase();

    return NextResponse.json({
      success: status.configured,
      status,
    });
  } catch (error) {
    console.error("Error en GET /api/catalog/status", error);

    return NextResponse.json(
      {
        success: false,
        message: "No se pudo obtener el estado del catalogo.",
      },
      { status: 500 },
    );
  }
}
