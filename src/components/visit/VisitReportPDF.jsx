import React from 'react';
import moment from 'moment';

export default function VisitReportPDF({ pet, visit }) {
    const duration = moment(visit.check_out_time || new Date()).diff(moment(visit.check_in_time), 'hours', true);

    return (
        <div id="visit-report" className="bg-white p-8 max-w-2xl mx-auto" style={{ fontFamily: 'Arial, sans-serif' }}>
            {/* Header */}
            <div className="text-center border-b-2 border-amber-500 pb-6 mb-6">
                <h1 className="text-3xl font-bold text-stone-800">🐕 Doggie Daycare</h1>
                <p className="text-stone-500 mt-1">Visit Report</p>
            </div>

            {/* Pet Info */}
            <div className="flex items-start gap-6 mb-6">
                {pet.photo_url && (
                    <img 
                        src={pet.photo_url} 
                        alt={pet.name}
                        className="w-24 h-24 rounded-lg object-cover"
                    />
                )}
                <div className="flex-1">
                    <h2 className="text-2xl font-bold text-stone-800">{pet.name}</h2>
                    <p className="text-stone-600">{pet.breed} • {pet.age} • {pet.weight} lbs</p>
                    <p className="text-stone-500 mt-2">Owner: {pet.owner_name}</p>
                </div>
            </div>

            {/* Visit Details */}
            <div className="bg-stone-50 rounded-lg p-4 mb-6">
                <h3 className="font-bold text-stone-700 mb-3">Visit Details</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                        <span className="text-stone-500">Date:</span>
                        <span className="ml-2 font-medium">{moment(visit.check_in_time).format('MMMM D, YYYY')}</span>
                    </div>
                    <div>
                        <span className="text-stone-500">Duration:</span>
                        <span className="ml-2 font-medium">{duration.toFixed(1)} hours</span>
                    </div>
                    <div>
                        <span className="text-stone-500">Check In:</span>
                        <span className="ml-2 font-medium">{moment(visit.check_in_time).format('h:mm A')}</span>
                    </div>
                    <div>
                        <span className="text-stone-500">Check Out:</span>
                        <span className="ml-2 font-medium">{moment(visit.check_out_time || new Date()).format('h:mm A')}</span>
                    </div>
                </div>
            </div>

            {/* Visit Type */}
            <div className="mb-6">
                <h3 className="font-bold text-stone-700 mb-3">Visit Type</h3>
                <div className="bg-stone-50 rounded-lg p-4">
                    <p className="text-sm text-stone-600">
                        <span className="font-medium">Type:</span>{' '}
                        {visit.visit_type === 'boarding' ? 'Boarding' : 'Play Camp'}
                        {visit.play_camp_duration && ` (${visit.play_camp_duration === 'half_day' ? 'Half Day' : 'Full Day'})`}
                    </p>
                    {visit.scheduled_checkout_date && (
                        <p className="text-sm text-stone-600 mt-1">
                            <span className="font-medium">Scheduled Checkout:</span>{' '}
                            {moment(visit.scheduled_checkout_date).format('MMMM D, YYYY')}
                        </p>
                    )}
                </div>
            </div>

            {/* Scheduled Tasks Summary (Boarding) */}
            {visit.visit_type === 'boarding' && visit.scheduled_tasks && visit.scheduled_tasks.length > 0 && (
                <div className="mb-6">
                    <h3 className="font-bold text-stone-700 mb-3">Daily Schedule</h3>
                    <div className="border border-stone-200 rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-stone-50">
                                <tr className="text-left text-stone-500">
                                    <th className="p-2">Time</th>
                                    <th className="p-2">Task</th>
                                    <th className="p-2">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visit.scheduled_tasks
                                    .sort((a, b) => moment(a.time, 'h:mm A').diff(moment(b.time, 'h:mm A')))
                                    .map((task, i) => (
                                        <tr key={i} className="border-t border-stone-100">
                                            <td className="p-2 text-stone-500">{task.time}</td>
                                            <td className="p-2 font-medium">
                                                {task.type === 'Medication' ? task.medication_name : task.type}
                                            </td>
                                            <td className="p-2">
                                                {task.completed ? `✅ ${task.completed_at}` : '❌ Not completed'}
                                            </td>
                                        </tr>
                                    ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Play Sessions Summary */}
            {visit.play_sessions && visit.play_sessions.length > 0 && (
                <div className="mb-6">
                    <h3 className="font-bold text-stone-700 mb-3">Play Sessions</h3>
                    <div className="bg-emerald-50 rounded-lg p-4">
                        <p className="text-sm text-stone-600">
                            <span className="font-medium">Sessions completed:</span>{' '}
                            {visit.play_sessions.filter(s => s.completed).length} / {visit.play_sessions.length}
                        </p>
                    </div>
                </div>
            )}

            {/* Feeding Instructions */}
            {pet.feeding_instructions && (
                <div className="mb-6">
                    <h3 className="font-bold text-stone-700 mb-3">Feeding Instructions</h3>
                    <div className="bg-amber-50 rounded-lg p-4">
                        <p className="text-sm text-stone-600 whitespace-pre-wrap">{pet.feeding_instructions}</p>
                    </div>
                </div>
            )}

            {/* Activity Log */}
            {visit.care_log?.length > 0 && (
                <div className="mb-6">
                    <h3 className="font-bold text-stone-700 mb-3 flex items-center gap-2">
                        📋 Activity Log
                    </h3>
                    <div className="border border-stone-200 rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-stone-50">
                                <tr className="text-left text-stone-500">
                                    <th className="p-2">Time</th>
                                    <th className="p-2">Activity</th>
                                    <th className="p-2">Notes</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visit.care_log.map((log, i) => (
                                    <tr key={i} className="border-t border-stone-100">
                                        <td className="p-2 text-stone-500">{log.time}</td>
                                        <td className="p-2 font-medium">{log.activity}</td>
                                        <td className="p-2 text-stone-600">{log.notes || '-'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Behavior Notes */}
            {visit.behavior_notes && (
                <div className="mb-6">
                    <h3 className="font-bold text-stone-700 mb-3">Behavior Notes</h3>
                    <div className="bg-blue-50 rounded-lg p-4">
                        <p className="text-sm text-stone-600">{visit.behavior_notes}</p>
                    </div>
                </div>
            )}

            {/* Footer */}
            <div className="text-center text-stone-400 text-sm mt-8 pt-6 border-t border-stone-200">
                <p>Thank you for choosing Doggie Daycare!</p>
                <p className="mt-1">We love having {pet.name} with us 🐾</p>
            </div>
        </div>
    );
}