import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText } from "lucide-react";
import moment from "moment";

export default function PreliminaryReportDialog({ pet, visit, open, onClose }) {
    if (!pet || !visit) return null;

    const duration = moment().diff(moment(visit.check_in_time), 'hours', true);
    const completedTasks = visit.scheduled_tasks?.filter(t => t.completed) || [];

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FileText className="w-5 h-5 text-blue-500" />
                        Preliminary Report — {pet.name}
                    </DialogTitle>
                </DialogHeader>

                <ScrollArea className="flex-1 overflow-y-auto pr-2">
                    <div className="space-y-5 py-2">
                        {/* Visit Info */}
                        <div className="bg-stone-50 rounded-xl p-4">
                            <h3 className="font-semibold text-stone-700 mb-3 text-sm">Visit Details</h3>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                                <div><span className="text-stone-500">Pet:</span> <strong>{pet.name}</strong></div>
                                <div><span className="text-stone-500">Owner:</span> <strong>{pet.owner_name}</strong></div>
                                <div><span className="text-stone-500">Breed:</span> <strong>{pet.breed || '—'}</strong></div>
                                <div><span className="text-stone-500">Type:</span> <strong>{visit.visit_type === 'boarding' ? 'Boarding' : 'Play Camp'}</strong></div>
                                <div><span className="text-stone-500">Check In:</span> <strong>{moment(visit.check_in_time).format('MMM D, YYYY h:mm A')}</strong></div>
                                <div><span className="text-stone-500">Duration so far:</span> <strong>{duration.toFixed(1)} hrs</strong></div>
                                {visit.scheduled_checkout_date && (
                                    <div><span className="text-stone-500">Scheduled Out:</span> <strong>{moment(visit.scheduled_checkout_date).format('MMM D, YYYY')}</strong></div>
                                )}
                                {visit.location && (
                                    <div><span className="text-stone-500">Location:</span> <strong>{visit.location}</strong></div>
                                )}
                            </div>
                        </div>

                        {/* Completed Tasks */}
                        <div>
                            <h3 className="font-semibold text-stone-700 mb-2 text-sm">Completed Tasks ({completedTasks.length})</h3>
                            {completedTasks.length === 0 ? (
                                <p className="text-sm text-stone-400 italic">No tasks completed yet.</p>
                            ) : (
                                <table className="w-full text-sm border border-stone-200 rounded-xl overflow-hidden">
                                    <thead className="bg-stone-50">
                                        <tr>
                                            <th className="text-left px-3 py-2 text-stone-500 font-medium">Time</th>
                                            <th className="text-left px-3 py-2 text-stone-500 font-medium">Task</th>
                                            <th className="text-left px-3 py-2 text-stone-500 font-medium">Completed</th>
                                            <th className="text-left px-3 py-2 text-stone-500 font-medium">By</th>
                                            <th className="text-left px-3 py-2 text-stone-500 font-medium">Notes</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {completedTasks.map((task, i) => (
                                            <tr key={i} className="border-t border-stone-100">
                                                <td className="px-3 py-2 text-stone-500">{task.time || '—'}</td>
                                                <td className="px-3 py-2 font-medium text-stone-800">
                                                    {task.type === 'Medication' ? task.medication_name : task.type}
                                                </td>
                                                <td className="px-3 py-2 text-stone-600">{task.completed_at || '—'}</td>
                                                <td className="px-3 py-2">
                                                    <span className="font-bold text-[#82bb32]">{task.completed_by || '—'}</span>
                                                </td>
                                                <td className="px-3 py-2 text-stone-500">{task.notes || '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        {/* Play Sessions */}
                        {visit.play_sessions?.length > 0 && (
                            <div>
                                <h3 className="font-semibold text-stone-700 mb-2 text-sm">Play Sessions</h3>
                                <div className="flex gap-2 flex-wrap">
                                    {visit.play_sessions.map((s, i) => (
                                        <div key={i} className={`px-3 py-2 rounded-xl text-sm border ${s.completed ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-stone-50 border-stone-200 text-stone-400'}`}>
                                            Session {s.session_number} {s.completed ? `✓ ${s.completed_at || ''}` : '(pending)'}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Activity Log */}
                        <div>
                            <h3 className="font-semibold text-stone-700 mb-2 text-sm">Activity Log ({visit.care_log?.length || 0})</h3>
                            {!visit.care_log?.length ? (
                                <p className="text-sm text-stone-400 italic">No activities logged yet.</p>
                            ) : (
                                <table className="w-full text-sm border border-stone-200 rounded-xl overflow-hidden">
                                    <thead className="bg-stone-50">
                                        <tr>
                                            <th className="text-left px-3 py-2 text-stone-500 font-medium">Time</th>
                                            <th className="text-left px-3 py-2 text-stone-500 font-medium">Activity</th>
                                            <th className="text-left px-3 py-2 text-stone-500 font-medium">Notes</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {visit.care_log.map((log, i) => (
                                            <tr key={i} className="border-t border-stone-100">
                                                <td className="px-3 py-2 text-stone-500">{log.time}</td>
                                                <td className="px-3 py-2 font-medium text-stone-800">{log.activity}</td>
                                                <td className="px-3 py-2 text-stone-500">{log.notes || '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
}