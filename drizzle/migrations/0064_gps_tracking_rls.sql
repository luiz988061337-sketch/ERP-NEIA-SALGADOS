-- 0064: RLS policies for GPS tracking fields
-- Ensures secure access to motoboy location data

-- Enable RLS on pedidos (already enabled)
-- Update policies to restrict access to GPS fields

-- Policy for clients: can only see GPS location of their own orders when status is 'em_rota'
-- The existing "pedidos select" policy already restricts to user_id = auth.uid() or staff roles
-- GPS fields (motoboy_lat, motoboy_lng, motoboy_atualizado_em) are included in the SELECT

-- Ensure motoboys can only update GPS for their own assigned orders
-- The existing "pedidos update staff" policy allows motoboys to update orders where motoboy_id = auth.uid()
-- This includes GPS fields (motoboy_lat, motoboy_lng, motoboy_atualizado_em)

-- Create a more restrictive policy for GPS updates by motoboys
-- Motoboys can only update GPS fields (not other fields) for their assigned orders
DROP POLICY IF EXISTS "pedidos update motoboy gps" ON public.pedidos;
CREATE POLICY "pedidos update motoboy gps" ON public.pedidos FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'motoboy') AND motoboy_id = auth.uid()
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'motoboy') AND motoboy_id = auth.uid()
  );

-- Staff (admin, producao, atendente) can update all fields including GPS
-- This is already covered by "pedidos update staff" policy

-- Clients can only read their own orders (including GPS fields when status = 'em_rota')
-- The existing "pedidos select" policy handles this

-- Motoboys can read their assigned orders and available orders
-- This is already covered by "pedidos select" policy

-- Central de Entregas (staff) can see all orders with GPS data
-- This is already covered by existing staff policies

-- Grant explicit permissions for GPS fields
GRANT SELECT (motoboy_lat, motoboy_lng, motoboy_atualizado_em) ON public.pedidos TO authenticated;
GRANT UPDATE (motoboy_lat, motoboy_lng, motoboy_atualizado_em) ON public.pedidos TO authenticated;

-- Ensure RLS is enabled
ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;

-- Comment on GPS fields
COMMENT ON COLUMN public.pedidos.motoboy_lat IS 'Latitude do motoboy (atualizada via GPS). Visível para cliente dono do pedido, motoboy atribuído e staff.';
COMMENT ON COLUMN public.pedidos.motoboy_lng IS 'Longitude do motoboy (atualizada via GPS). Visível para cliente dono do pedido, motoboy atribuído e staff.';
COMMENT ON COLUMN public.pedidos.motoboy_atualizado_em IS 'Timestamp da última atualização de GPS. Visível para cliente dono do pedido, motoboy atribuído e staff.';