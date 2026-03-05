import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Home, Sparkles } from "lucide-react";
import { motion } from "framer-motion";

export default function CheckInTypeSelector({ onSelect }) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
            >
                <Card 
                    className="cursor-pointer hover:shadow-xl transition-all border-2 border-transparent hover:border-blue-300 rounded-2xl overflow-hidden"
                    onClick={() => onSelect('boarding')}
                >
                    <CardHeader className="bg-gradient-to-br from-blue-50 to-indigo-50 pb-8">
                        <div className="w-16 h-16 bg-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
                            <Home className="w-8 h-8 text-white" />
                        </div>
                        <CardTitle className="text-center text-xl">Boarding</CardTitle>
                    </CardHeader>
                    <CardContent className="p-6">
                        <ul className="space-y-2 text-sm text-stone-600">
                            <li>• Overnight stay</li>
                            <li>• Scheduled feeding times</li>
                            <li>• Regular potty breaks</li>
                            <li>• Medication administration</li>
                            <li>• Optional play camp add-on</li>
                        </ul>
                        <Button className="w-full mt-6 rounded-xl bg-blue-500 hover:bg-blue-600">
                            Select Boarding
                        </Button>
                    </CardContent>
                </Card>
            </motion.div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
            >
                <Card 
                    className="cursor-pointer hover:shadow-xl transition-all border-2 border-transparent hover:border-emerald-300 rounded-2xl overflow-hidden"
                    onClick={() => onSelect('play_camp')}
                >
                    <CardHeader className="bg-gradient-to-br from-emerald-50 to-green-50 pb-8">
                        <div className="w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
                            <Sparkles className="w-8 h-8 text-white" />
                        </div>
                        <CardTitle className="text-center text-xl">Play Camp</CardTitle>
                    </CardHeader>
                    <CardContent className="p-6">
                        <ul className="space-y-2 text-sm text-stone-600">
                            <li>• Half day or full day</li>
                            <li>• Supervised play sessions</li>
                            <li>• Socialization with other pets</li>
                            <li>• Exercise and enrichment</li>
                            <li>• Same-day pickup</li>
                        </ul>
                        <Button className="w-full mt-6 rounded-xl bg-emerald-500 hover:bg-emerald-600">
                            Select Play Camp
                        </Button>
                    </CardContent>
                </Card>
            </motion.div>
        </div>
    );
}