import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', {
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            }
        })
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        const supabase = createClient(supabaseUrl, supabaseKey)

        const body = await req.json()

        let sensorData: Record<string, any> = {}

        if (body.attributes) {
            sensorData = body.attributes
        } else if (body.data) {
            sensorData = body.data
        } else {
            sensorData = body
        }

        const row = {
            temp: sensorData.Temp ?? sensorData.temp ?? null,
            humidity: sensorData.Humi ?? sensorData.humidity ?? null,
            light: sensorData.Light ?? sensorData.light ?? null,
            co2: sensorData.CO2 ?? sensorData.co2 ?? null,
            voc: sensorData.VOC ?? sensorData.voc ?? null,
            ch2o: sensorData.CH2O ?? sensorData.ch2o ?? null,
            fan: sensorData.FAN ?? sensorData.fan ?? false,
            jsq: sensorData.JSQ ?? sensorData.jsq ?? false,
            led: sensorData.LED ?? sensorData.led ?? false,
            beep: sensorData.BEEP ?? sensorData.beep ?? false,
            app_mode: sensorData.APP_Mode ?? sensorData.app_mode ?? 1,
            temp_f: sensorData.Temp_F ?? sensorData.temp_f ?? null,
            humi_f: sensorData.Humi_F ?? sensorData.humi_f ?? null,
            light_f: sensorData.Light_F ?? sensorData.light_f ?? null,
            co2_f: sensorData.CO2_F ?? sensorData.co2_f ?? null,
        }

        const { error } = await supabase
            .from('sensor_data')
            .insert(row)

        if (error) {
            console.error('Insert error:', error)
            return new Response(JSON.stringify({ error: error.message }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            })
        }

        return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        })
    } catch (err) {
        console.error('Function error:', err)
        return new Response(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        })
    }
})
